import { afterEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { removeTestCatalogRows, useTestDb } from '../helpers/db.js'
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

describe('messages: idempotencia por clientId', () => {
  const SENDER_ID = new mongoose.Types.ObjectId()
  const message = (overrides) => ({ planId: new mongoose.Types.ObjectId(), senderId: SENDER_ID, text: 'Hola', status: 'visible', ...overrides })

  it('rechaza dos mensajes del mismo remitente con el mismo clientId', async () => {
    await raw('messages').insertOne(message({ clientId: 'c-1' }))

    await expect(raw('messages').insertOne(message({ clientId: 'c-1' }))).rejects.toMatchObject({ code: 11000 })
  })

  it('los mensajes sin clientId no compiten entre sí (índice parcial)', async () => {
    await raw('messages').insertMany([message(), message()])

    expect(await raw('messages').countDocuments()).toBe(2)
  })

  it('notas de voz: con audio y duración y sin texto; un texto sin audio (S5)', async () => {
    const audioKey = `messages/${new mongoose.Types.ObjectId()}/${SENDER_ID}/abc.m4a`
    const voice = (overrides) => { const { text, ...rest } = message({ type: 'voice', audioKey, durationMs: 3000, ...overrides }); return rest }
    await raw('messages').insertOne(voice())

    await expect(raw('messages').insertOne(message({ type: 'voice' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne({ ...voice(), text: 'hola' })).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne(voice({ durationMs: 60001 }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne(voice({ audioKey: 'otra/clave.mp3' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne(message({ audioKey }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne(message({ type: 'image' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza un clientId con caracteres no permitidos o de más de 64', async () => {
    await expect(raw('messages').insertOne(message({ clientId: 'con espacios' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('messages').insertOne(message({ clientId: 'x'.repeat(65) }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})

describe('reports: motivos fijos y un solo pendiente por persona y objetivo', () => {
  const REPORTER_ID = new mongoose.Types.ObjectId()
  const TARGET_ID = new mongoose.Types.ObjectId()
  const report = (overrides) => ({ reporterId: REPORTER_ID, targetType: 'plan', targetId: TARGET_ID, reason: 'spam', status: 'pending', ...overrides })

  it('rechaza un segundo reporte pendiente de la misma persona sobre lo mismo', async () => {
    await raw('reports').insertOne(report())

    await expect(raw('reports').insertOne(report({ reason: 'scam' }))).rejects.toMatchObject({ code: 11000 })
  })

  it('los resueltos no compiten (índice parcial): se puede volver a reportar', async () => {
    await raw('reports').insertMany([report({ status: 'reviewed' }), report({ status: 'dismissed' }), report()])

    expect(await raw('reports').countDocuments()).toBe(3)
  })

  it('rechaza un motivo fuera de la lista y una descripción de más de 500', async () => {
    await expect(raw('reports').insertOne(report({ reason: 'no-me-gusta' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('reports').insertOne(report({ description: 'x'.repeat(501) }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})

describe('validadores $jsonSchema (sin pasar por Mongoose)', () => {
  it('rechaza participantCount mayor que capacity', async () => {
    const plan = await makePlan({ capacity: 2 })

    await expect(raw('plans').updateOne({ _id: plan._id }, { $set: { participantCount: 3 } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza un reminderSentAt que no es fecha (S5)', async () => {
    const plan = await makePlan()

    await expect(raw('plans').updateOne({ _id: plan._id }, { $set: { reminderSentAt: 'ayer' } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('spotAlerts: un solo pedido por persona y plan, con planId y userId obligatorios (S5)', async () => {
    const alert = { planId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), createdAt: new Date() }
    await raw('spotAlerts').insertOne({ ...alert })

    await expect(raw('spotAlerts').insertOne({ ...alert })).rejects.toMatchObject({ code: 11000 })
    await expect(raw('spotAlerts').insertOne({ planId: alert.planId, createdAt: new Date() })).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
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

describe('sessions', () => {
  const session = (overrides = {}) => ({
    userId: new mongoose.Types.ObjectId(),
    sid: `sid-${Math.random()}`,
    refreshTokenHash: 'a'.repeat(64),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides
  })

  it('el índice TTL de expiresAt borra la sesión al vencer (expireAfterSeconds: 0)', async () => {
    const indexes = await raw('sessions').indexes()

    expect(indexes.find((index) => index.name === 'expiresAt_ttl')).toMatchObject({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })
  })

  it('rechaza dos sesiones con el mismo sid', async () => {
    await raw('sessions').insertOne(session({ sid: 'dup' }))

    await expect(raw('sessions').insertOne(session({ sid: 'dup' }))).rejects.toMatchObject({ code: 11000 })
  })

  it('rechaza una sesión sin refreshTokenHash', async () => {
    const { refreshTokenHash, ...incomplete } = session()

    await expect(raw('sessions').insertOne(incomplete)).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza un expiresAt que no es fecha', async () => {
    await expect(raw('sessions').insertOne(session({ expiresAt: '2030-01-01' })))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})

describe('passwordResets', () => {
  const reset = (overrides = {}) => ({
    userId: new mongoose.Types.ObjectId(),
    codeHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    requestCount: 1,
    lastSentAt: new Date(),
    windowEndsAt: new Date(Date.now() + 3_600_000),
    ...overrides
  })

  it('un solo pedido por usuario', async () => {
    const userId = new mongoose.Types.ObjectId()
    await raw('passwordResets').insertOne(reset({ userId }))

    await expect(raw('passwordResets').insertOne(reset({ userId }))).rejects.toMatchObject({ code: 11000 })
  })

  it('el índice TTL de windowEndsAt borra el pedido al terminar la ventana', async () => {
    const indexes = await raw('passwordResets').indexes()

    expect(indexes.find((index) => index.name === 'windowEndsAt_ttl')).toMatchObject({ key: { windowEndsAt: 1 }, expireAfterSeconds: 0 })
  })

  it('rechaza guardar algo que no sea el HMAC del código, intentos negativos o un pedido sin vencimiento', async () => {
    const { expiresAt, ...incomplete } = reset()

    await expect(raw('passwordResets').insertOne(reset({ codeHash: '123456' }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('passwordResets').insertOne(reset({ attempts: -1 }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('passwordResets').insertOne(incomplete)).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })
})

describe('validador de users: perfil', () => {
  it('rechaza un birthDate que no es fecha', async () => {
    const user = await makeUser()

    await expect(raw('users').updateOne({ _id: user._id }, { $set: { birthDate: '2000-01-01' } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it.each([
    ['university', ''],
    ['university', 'Universidad de Montevideo'],
    ['career', 'x'.repeat(81)],
    ['city', 'Montevideo'],
    ['neighborhood', ''],
    ['neighborhood', 'Pocitos']
  ])('rechaza %s con un valor que no es una key (%j)', async (field, value) => {
    const user = await makeUser()

    await expect(raw('users').updateOne({ _id: user._id }, { $set: { [field]: value } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('rechaza más de 10 intereses y keys mal formadas', async () => {
    const user = await makeUser()
    const eleven = Array.from({ length: 11 }, (_, i) => `interes-${i}`)

    await expect(raw('users').updateOne({ _id: user._id }, { $set: { interests: eleven } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
    await expect(raw('users').updateOne({ _id: user._id }, { $set: { interests: ['Fútbol'] } }))
      .rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('acepta un perfil completo', async () => {
    const user = await makeUser()

    await expect(raw('users').updateOne({ _id: user._id }, {
      $set: { birthDate: new Date('2001-03-09T00:00:00Z'), university: 'um', career: 'economia', city: 'montevideo', neighborhood: 'pocitos', onboardingCompletedAt: new Date() }
    })).resolves.toBeDefined()
  })
})

describe('catálogos', () => {
  afterEach(removeTestCatalogRows)

  const doc = (overrides = {}) => ({ key: 'algo', name: 'Algo', order: 1, active: true, ...overrides })

  it('las colecciones quedan cargadas por la migración inicial', async () => {
    for (const [name, minimum] of [['interestCategories', 8], ['interests', 50], ['universities', 7], ['careers', 200], ['cities', 1], ['neighborhoods', 62]]) {
      expect(await raw(name).countDocuments(), name).toBeGreaterThanOrEqual(minimum)
    }
  })

  it.each([
    ['interestCategories', {}],
    ['universities', { shortName: 'X' }],
    ['cities', { department: 'X' }]
  ])('%s: rechaza una key repetida', async (name, extra) => {
    await raw(name).insertOne(doc({ key: 'test-repetida', ...extra }))

    await expect(raw(name).insertOne(doc({ key: 'test-repetida', ...extra }))).rejects.toMatchObject({ code: 11000 })
  })

  it('careers: la key es única dentro de cada universidad, no global', async () => {
    await raw('careers').insertOne(doc({ key: 'test-unica', universityKey: 'um' }))

    await expect(raw('careers').insertOne(doc({ key: 'test-unica', universityKey: 'um' }))).rejects.toMatchObject({ code: 11000 })
    await expect(raw('careers').insertOne(doc({ key: 'test-unica', universityKey: 'ort' }))).resolves.toBeDefined()
  })

  it('neighborhoods: la key es única dentro de cada ciudad', async () => {
    await raw('neighborhoods').insertOne(doc({ key: 'test-unico', cityKey: 'montevideo' }))

    await expect(raw('neighborhoods').insertOne(doc({ key: 'test-unico', cityKey: 'montevideo' }))).rejects.toMatchObject({ code: 11000 })
  })

  it.each([
    ['key con mayúsculas', { key: 'Futbol' }],
    ['key con espacios', { key: 'tocar la guitarra' }],
    ['nombre vacío', { name: '' }],
    ['sin active', { active: undefined }],
    ['categoryKey inválida', { categoryKey: 'Deportes' }],
    ['minAge menor de 16', { minAge: 15 }],
    ['minAge decimal', { minAge: 18.5 }]
  ])('interests: rechaza %s', async (_label, override) => {
    await expect(raw('interests').insertOne(doc({ categoryKey: 'deportes', ...override }))).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('interests: acepta minAge 18 y sin minAge', async () => {
    await expect(raw('interests').insertOne(doc({ key: 'test-con-edad', categoryKey: 'deportes', minAge: 18 }))).resolves.toBeDefined()
    await expect(raw('interests').insertOne(doc({ key: 'test-sin-edad', categoryKey: 'deportes' }))).resolves.toBeDefined()
  })
})

describe('índice 2dsphere', () => {
  it('ordena por cercanía con coordenadas [lng, lat]', async () => {
    const creator = await makeUser()
    const far = await makePlan({ creatorId: creator._id, location: { label: 'Lejos', type: 'Point', coordinates: [-56.05, -34.88] } })
    const near = await makePlan({ creatorId: creator._id, location: { label: 'Cerca', type: 'Point', coordinates: [-56.165, -34.902] } })

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
