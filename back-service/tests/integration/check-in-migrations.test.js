// Migraciones de S4: los planes anteriores reciben la ventana y el radio de check-in, y los validadores nuevos
// protegen los invariantes aunque alguien escriba directo en la base.
import { describe, expect, it } from 'vitest'
import { getConnection } from '../../src/adapters/db/index.js'
import { useTestDb } from '../helpers/db.js'
import { MONTEVIDEO, makePlan, makeUser } from '../helpers/factories.js'

useTestDb()

const DOCUMENT_VALIDATION_FAILED = 121
const raw = (name) => getConnection().db.collection(name)

describe('planes anteriores a S4', () => {
  it('reciben la ventana (15 min antes, 60 min después, nunca después de endsAt) y el radio por defecto', async () => {
    const { db } = getConnection()
    const validator = await import('../../migrations/20261013120100-plans-validator-check-in.js')
    const backfill = await import('../../migrations/20261013120000-plans-backfill-check-in.js')
    await validator.down(db) // estado anterior: validador de S3, sin que cambie el changelog
    const creator = await makeUser()
    const base = {
      location: { label: 'Montevideo', type: 'Point', coordinates: [...MONTEVIDEO] }, interests: ['futbol'], capacity: 5, price: 0, participantCount: 0, creatorId: creator._id, status: 'open'
    }
    const startsAt = new Date('2026-11-01T21:00:00Z')
    const { insertedIds } = await raw('plans').insertMany([
      { ...base, title: 'Plan largo', startsAt, endsAt: new Date('2026-11-01T23:00:00Z') },
      { ...base, title: 'Plan corto', startsAt, endsAt: new Date('2026-11-01T21:30:00Z'), checkInRadiusMeters: 5 },
      { ...base, title: 'Con radio propio', startsAt, endsAt: new Date('2026-11-01T23:00:00Z'), checkInRadiusMeters: 300 }
    ])

    await backfill.up(db)
    await validator.up(db)

    const [long, short, custom] = await Promise.all(Object.values(insertedIds).map((_id) => raw('plans').findOne({ _id })))
    expect(long).toMatchObject({ checkInOpensAt: new Date('2026-11-01T20:45:00Z'), checkInClosesAt: new Date('2026-11-01T22:00:00Z'), checkInRadiusMeters: 150 })
    expect(short).toMatchObject({ checkInClosesAt: new Date('2026-11-01T21:30:00Z'), checkInRadiusMeters: 150 })
    expect(custom.checkInRadiusMeters).toBe(300)
  })
})

describe('validadores de S4', () => {
  it.each([
    ['un radio fuera de rango', { $set: { checkInRadiusMeters: 10 } }],
    ['una ventana que cierra después de endsAt', { $set: { checkInClosesAt: new Date(Date.UTC(2031, 0, 1)) } }],
    ['una ventana que cierra antes de abrir', { $set: { checkInClosesAt: new Date(Date.UTC(2029, 0, 1)) } }],
    ['un plan sin ventana de check-in', { $unset: { checkInOpensAt: '' } }]
  ])('plans rechaza %s', async (_label, update) => {
    const plan = await makePlan()

    await expect(raw('plans').updateOne({ _id: plan._id }, update)).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('checkIns acepta los dos métodos y sigue sin admitir la ubicación del participante', async () => {
    const plan = await makePlan()
    const [ana, beto, caro] = await Promise.all([makeUser(), makeUser(), makeUser()])
    const checkIn = (userId, extra) => ({ planId: plan._id, userId, checkedInAt: new Date(), distanceMeters: 12, accuracyMeters: 8, ...extra })

    await expect(raw('checkIns').insertOne(checkIn(ana._id, { method: 'qr-location' }))).resolves.toBeDefined()
    await expect(raw('checkIns').insertOne(checkIn(beto._id, { method: 'location' }))).resolves.toBeDefined()
    await expect(raw('checkIns').insertOne(checkIn(caro._id, { method: 'manual' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('checkIns').insertOne(checkIn(caro._id, { method: 'location', location: { type: 'Point', coordinates: [...MONTEVIDEO] } })))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})
