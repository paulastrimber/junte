import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { Session } from '../../src/modules/auth/session.model.js'
import { createSessionRepository } from '../../src/modules/auth/session.repository.js'

useTestDb()

const repo = createSessionRepository(Session)
const NOW = new Date('2026-10-11T12:00:00Z')
const IN_30_DAYS = new Date('2026-11-10T12:00:00Z')
const newUserId = () => new mongoose.Types.ObjectId().toString()
let counter = 0

async function createSession ({ userId = newUserId(), hash = 'hash-0', now = NOW, expiresAt = IN_30_DAYS, ...rest } = {}) {
  return repo.create({ userId, sid: `sid-${++counter}`, refreshTokenHash: hash, now, expiresAt, ...rest })
}

describe('create', () => {
  it('guarda la sesión activa, sin revokedAt', async () => {
    const userId = newUserId()

    const session = await createSession({ userId, deviceLabel: 'android' })

    expect(session).toMatchObject({ userId, deviceLabel: 'android', refreshTokenHash: 'hash-0', lastUsedAt: NOW, expiresAt: IN_30_DAYS })
    expect(session.revokedAt).toBeUndefined()
    expect(await Session.countDocuments({ sid: session.sid })).toBe(1)
  })
})

describe('rotate (actualización condicional sobre el hash vigente)', () => {
  it('cambia el hash, lastUsedAt y expiresAt de la sesión', async () => {
    const session = await createSession({ hash: 'hash-1' })
    const later = new Date('2026-10-12T12:00:00Z')
    const newExpiry = new Date('2026-11-11T12:00:00Z')

    const rotated = await repo.rotate({
      sid: session.sid, userId: session.userId, currentHash: 'hash-1', newHash: 'hash-2', now: later, expiresAt: newExpiry
    })

    expect(rotated).toMatchObject({ sid: session.sid, refreshTokenHash: 'hash-2', lastUsedAt: later, expiresAt: newExpiry })
  })

  it('con el hash viejo ya rotado devuelve null y no toca la sesión', async () => {
    const session = await createSession({ hash: 'hash-1' })
    const args = { sid: session.sid, userId: session.userId, now: NOW, expiresAt: IN_30_DAYS }
    await repo.rotate({ ...args, currentHash: 'hash-1', newHash: 'hash-2' })

    const replay = await repo.rotate({ ...args, currentHash: 'hash-1', newHash: 'hash-3' })

    expect(replay).toBeNull()
    expect((await Session.findOne({ sid: session.sid })).refreshTokenHash).toBe('hash-2')
  })

  it('no rota una sesión revocada', async () => {
    const session = await createSession({ hash: 'hash-1' })
    await repo.revokeBySid(session.sid, { now: NOW })

    const rotated = await repo.rotate({
      sid: session.sid, userId: session.userId, currentHash: 'hash-1', newHash: 'hash-2', now: NOW, expiresAt: IN_30_DAYS
    })

    expect(rotated).toBeNull()
  })

  it('no rota una sesión vencida', async () => {
    const session = await createSession({ hash: 'hash-1', expiresAt: new Date('2026-10-11T11:59:59Z') })

    const rotated = await repo.rotate({
      sid: session.sid, userId: session.userId, currentHash: 'hash-1', newHash: 'hash-2', now: NOW, expiresAt: IN_30_DAYS
    })

    expect(rotated).toBeNull()
  })

  it('no rota la sesión de otro usuario aunque el sid y el hash coincidan', async () => {
    const session = await createSession({ hash: 'hash-1' })

    const rotated = await repo.rotate({
      sid: session.sid, userId: newUserId(), currentHash: 'hash-1', newHash: 'hash-2', now: NOW, expiresAt: IN_30_DAYS
    })

    expect(rotated).toBeNull()
  })

  it('con 10 rotaciones simultáneas del mismo hash gana exactamente una', async () => {
    const session = await createSession({ hash: 'hash-1' })

    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => repo.rotate({
      sid: session.sid, userId: session.userId, currentHash: 'hash-1', newHash: `winner-${i}`, now: NOW, expiresAt: IN_30_DAYS
    })))

    const winners = results.filter(Boolean)
    expect(winners).toHaveLength(1)
    expect((await Session.findOne({ sid: session.sid })).refreshTokenHash).toBe(winners[0].refreshTokenHash)
  })
})

describe('revocación', () => {
  it('revokeBySid es idempotente: no pisa la fecha de la primera revocación', async () => {
    const session = await createSession()
    const first = new Date('2026-10-11T13:00:00Z')

    await repo.revokeBySid(session.sid, { now: first })
    await repo.revokeBySid(session.sid, { now: new Date('2026-10-11T14:00:00Z') })

    expect((await Session.findOne({ sid: session.sid })).revokedAt).toEqual(first)
  })

  it('revokeAllByUser cierra solo las sesiones activas de ese usuario', async () => {
    const userId = newUserId()
    const mine = await Promise.all([createSession({ userId }), createSession({ userId })])
    const other = await createSession()

    const count = await repo.revokeAllByUser(userId, { now: NOW })

    expect(count).toBe(2)
    for (const { sid } of mine) expect((await Session.findOne({ sid })).revokedAt).toEqual(NOW)
    expect((await Session.findOne({ sid: other.sid })).revokedAt).toBeUndefined()
  })
})

describe('revokeOldestBeyond (tope de sesiones activas)', () => {
  it('con 7 activas y tope 5 revoca las 2 más antiguas por creación', async () => {
    const userId = newUserId()
    const created = []
    for (let i = 0; i < 7; i++) {
      created.push(await createSession({ userId, now: new Date(NOW.getTime() + i * 1000) }))
    }

    const revoked = await repo.revokeOldestBeyond(userId, 5, { now: NOW })

    expect(revoked).toBe(2)
    const state = await Promise.all(created.map(async ({ sid }) => Boolean((await Session.findOne({ sid })).revokedAt)))
    expect(state).toEqual([true, true, false, false, false, false, false])
  })

  it('no cuenta las revocadas ni las vencidas, y no toca a otros usuarios', async () => {
    const userId = newUserId()
    await createSession({ userId, expiresAt: new Date('2026-10-01T00:00:00Z') })
    const gone = await createSession({ userId })
    await repo.revokeBySid(gone.sid, { now: NOW })
    await Promise.all([1, 2, 3, 4, 5].map(() => createSession({ userId })))
    const other = await createSession()

    const revoked = await repo.revokeOldestBeyond(userId, 5, { now: NOW })

    expect(revoked).toBe(0)
    expect((await Session.findOne({ sid: other.sid })).revokedAt).toBeUndefined()
  })
})
