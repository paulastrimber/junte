import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createTokenService } from './tokens.js'

const SECRET = 'a-test-only-secret-with-at-least-32-chars!!'
const encoder = new TextEncoder()
const USER_ID = '665f1c2a9b1e8a0012345678'
const SID = 'sess-1'

function setup (overrides = {}) {
  const clock = createFixedClock('2026-10-11T12:00:00Z')
  const tokens = createTokenService({ secret: SECRET, clock, ...overrides })
  return { clock, tokens }
}

// Firma un token "a mano" para probar lo que el servicio debe rechazar.
function craft ({ alg = 'HS256', secret = SECRET, claims = {}, issuedAt = 1_791_000_000, expiresIn = 600 } = {}) {
  const jwt = new SignJWT({ typ: 'access', sid: SID, ...claims })
    .setProtectedHeader({ alg })
    .setSubject(USER_ID)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresIn)
  return jwt.sign(encoder.encode(secret))
}

const issuedNow = () => Math.floor(new Date('2026-10-11T12:00:00Z').getTime() / 1000)

describe('access token', () => {
  it('se emite con sub, sid, typ access y vence a los 15 minutos', async () => {
    const { tokens } = setup()

    const { token, expiresAt } = await tokens.signAccess({ userId: USER_ID, sid: SID })

    expect(await tokens.verifyAccess(token)).toEqual({ userId: USER_ID, sid: SID })
    expect(expiresAt).toEqual(new Date('2026-10-11T12:15:00Z'))
  })

  it('vencido → TOKEN_EXPIRED', async () => {
    const { tokens, clock } = setup()
    const { token } = await tokens.signAccess({ userId: USER_ID, sid: SID })

    clock.advance(15 * 60 * 1000 + 1000)

    await expect(tokens.verifyAccess(token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 })
  })

  it('un segundo antes de vencer todavía vale', async () => {
    const { tokens, clock } = setup()
    const { token } = await tokens.signAccess({ userId: USER_ID, sid: SID })

    clock.advance(15 * 60 * 1000 - 1000)

    await expect(tokens.verifyAccess(token)).resolves.toMatchObject({ userId: USER_ID })
  })

  it('firmado con otro secreto → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const forged = await craft({ secret: 'another-secret-with-at-least-32-characters', issuedAt: issuedNow() })

    await expect(tokens.verifyAccess(forged)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('firmado con otro algoritmo (HS512) → UNAUTHENTICATED aunque la firma sea correcta', async () => {
    const { tokens } = setup()
    const other = await craft({ alg: 'HS512', issuedAt: issuedNow() })

    await expect(tokens.verifyAccess(other)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('alg none sin firma → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const base64url = (object) => Buffer.from(JSON.stringify(object)).toString('base64url')
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      sub: USER_ID, typ: 'access', sid: SID, iat: issuedNow(), exp: issuedNow() + 600
    })}.`

    await expect(tokens.verifyAccess(unsigned)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('un refresh token usado como access → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const { token } = await tokens.signRefresh({ userId: USER_ID, sid: SID })

    await expect(tokens.verifyAccess(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('typ cambiado a mano (firmado con el secreto) → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const forged = await craft({ claims: { typ: 'service' }, issuedAt: issuedNow() })

    await expect(tokens.verifyAccess(forged)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('sin sid → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const forged = await craft({ claims: { sid: undefined }, issuedAt: issuedNow() })

    await expect(tokens.verifyAccess(forged)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it.each(['', 'abc', 'a.b.c', 'Bearer x'])('basura (%j) → UNAUTHENTICATED', async (garbage) => {
    const { tokens } = setup()

    await expect(tokens.verifyAccess(garbage)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('no expone el motivo del rechazo en el mensaje', async () => {
    const { tokens } = setup()

    const error = await tokens.verifyAccess('a.b.c').catch((e) => e)

    expect(error.message).not.toMatch(/jwt|jws|signature|alg/i)
  })
})

describe('refresh token', () => {
  it('lleva sub, sid, jti y vence a los 30 días', async () => {
    const { tokens } = setup()

    const { token, jti, expiresAt } = await tokens.signRefresh({ userId: USER_ID, sid: SID })

    expect(await tokens.verifyRefresh(token)).toEqual({ userId: USER_ID, sid: SID, jti })
    expect(expiresAt).toEqual(new Date('2026-11-10T12:00:00Z'))
  })

  it('cada emisión tiene un jti distinto, así dos refresh del mismo instante no son iguales', async () => {
    const { tokens } = setup()

    const first = await tokens.signRefresh({ userId: USER_ID, sid: SID })
    const second = await tokens.signRefresh({ userId: USER_ID, sid: SID })

    expect(first.jti).not.toBe(second.jti)
    expect(first.token).not.toBe(second.token)
  })

  it('un access token usado como refresh → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const { token } = await tokens.signAccess({ userId: USER_ID, sid: SID })

    await expect(tokens.verifyRefresh(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('vencido → UNAUTHENTICATED (no TOKEN_EXPIRED: la app no debe volver a intentar un refresh)', async () => {
    const { tokens, clock } = setup()
    const { token } = await tokens.signRefresh({ userId: USER_ID, sid: SID })

    clock.advance(31 * 24 * 60 * 60 * 1000)

    await expect(tokens.verifyRefresh(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('sin jti → UNAUTHENTICATED', async () => {
    const { tokens } = setup()
    const forged = await craft({ claims: { typ: 'refresh' }, issuedAt: issuedNow(), expiresIn: 3600 })

    await expect(tokens.verifyRefresh(forged)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('configuración', () => {
  it('rechaza un secreto corto', () => {
    expect(() => createTokenService({ secret: 'corto', clock: createFixedClock(new Date()) })).toThrow(/32/)
  })
})
