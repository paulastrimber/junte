import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { useTestDb } from '../helpers/db.js'
import { MONTEVIDEO, makeParticipation, makePlan, makeUser } from '../helpers/factories.js'
import { getConnection } from '../../src/adapters/db/index.js'
import { findIndexProblems } from '../../src/adapters/db/expected-indexes.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { CheckIn } from '../../src/modules/checkins/checkin.model.js'
import { DeviceToken } from '../../src/modules/devices/device-token.model.js'

useTestDb()

const DOCUMENT_VALIDATION_FAILED = 121
const raw = (name) => getConnection().db.collection(name)

describe('índices creados por las migraciones', () => {
  it('coinciden con la tabla de 07-modelo-de-datos.md', async () => {
    expect(await findIndexProblems(getConnection().db)).toEqual([])
  })
})

describe('índices únicos', () => {
  it('rechaza un segundo usuario con el mismo email normalizado', async () => {
    await makeUser({ email: 'ana@um.edu.uy' })

    await expect(makeUser({ email: '  ANA@um.edu.uy ' })).rejects.toMatchObject({ code: 11000 })
  })

  it('rechaza una segunda inscripción del mismo usuario al mismo plan', async () => {
    const plan = await makePlan()
    const user = await makeUser()
    await makeParticipation({ planId: plan._id, userId: user._id })

    await expect(makeParticipation({ planId: plan._id, userId: user._id, status: 'cancelled' }))
      .rejects.toMatchObject({ code: 11000 })
  })

  it('rechaza un segundo check-in del mismo usuario en el mismo plan', async () => {
    const plan = await makePlan()
    const user = await makeUser()
    const checkIn = { planId: plan._id, userId: user._id, checkedInAt: new Date(), distanceMeters: 12, accuracyMeters: 8 }
    await CheckIn.create(checkIn)

    await expect(CheckIn.create(checkIn)).rejects.toMatchObject({ code: 11000 })
  })

  it('rechaza el mismo token FCM dos veces', async () => {
    const user = await makeUser()
    await DeviceToken.create({ userId: user._id, token: 'fcm-token-1', platform: 'android' })

    await expect(DeviceToken.create({ userId: user._id, token: 'fcm-token-1', platform: 'ios' }))
      .rejects.toMatchObject({ code: 11000 })
  })
})

describe('validadores $jsonSchema (sin pasar por Mongoose)', () => {
  it('rechaza participantCount mayor que capacity', async () => {
    const plan = await makePlan({ capacity: 2 })

    await expect(raw('plans').updateOne({ _id: plan._id }, { $set: { participantCount: 3 } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza participantCount negativo', async () => {
    const plan = await makePlan()

    await expect(raw('plans').updateOne({ _id: plan._id }, { $inc: { participantCount: -1 } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza coordenadas fuera de rango', async () => {
    const plan = await makePlan()

    await expect(raw('plans').updateOne({ _id: plan._id }, { $set: { 'location.coordinates': [-56.16, -134.9] } }))
      .rejects.toBeDefined()
  })

  it('rechaza un role fuera del enum', async () => {
    const user = await makeUser()

    await expect(raw('users').updateOne({ _id: user._id }, { $set: { role: 'superadmin' } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza guardar la ubicación del participante en checkIns', async () => {
    const plan = await makePlan()
    const user = await makeUser()

    await expect(raw('checkIns').insertOne({
      planId: plan._id,
      userId: user._id,
      checkedInAt: new Date(),
      method: 'qr-location',
      distanceMeters: 10,
      location: { type: 'Point', coordinates: [...MONTEVIDEO] }
    })).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})

describe('índice 2dsphere', () => {
  it('ordena por cercanía con coordenadas [lng, lat]', async () => {
    const creator = await makeUser()
    const far = await makePlan({ creatorId: creator._id, location: { type: 'Point', coordinates: [-56.05, -34.88] } })
    const near = await makePlan({ creatorId: creator._id, location: { type: 'Point', coordinates: [-56.165, -34.902] } })

    const found = await Plan.find({
      location: { $near: { $geometry: { type: 'Point', coordinates: [...MONTEVIDEO] }, $maxDistance: 20_000 } }
    })

    expect(found.map((p) => p.id)).toEqual([near.id, far.id])
  })
})

describe('modelos', () => {
  it('no crean índices por su cuenta (autoIndex desactivado)', () => {
    expect(mongoose.get('autoIndex')).toBe(false)
    expect(Plan.schema.get('autoIndex')).toBe(false)
  })
})
