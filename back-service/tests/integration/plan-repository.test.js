// Repositorio de planes contra MongoDB real (replica set en memoria + migraciones): $geoNear sobre el índice 2dsphere,
// filtros predefinidos, cursor cronológico y actualización condicional del cupo (S3-BE-03 a 05).
import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { useTestDb } from '../helpers/db.js'
import { MONTEVIDEO, makeParticipation, makePlan, makeUser } from '../helpers/factories.js'
import { getConnection } from '../../src/adapters/db/index.js'
import { Participation, createParticipationRepository } from '../../src/modules/participations/index.js'
import { Plan, createPlanRepository } from '../../src/modules/plans/index.js'

useTestDb()

const planRepo = createPlanRepository(Plan)
const participationRepo = createParticipationRepository(Participation)

// Posterior a la fecha real: los planes de prueba se crean "hoy" y el feed solo toma los creados hasta `asOf`.
const NOW = new Date('2028-03-01T15:00:00Z')
const DOCUMENT_VALIDATION_FAILED = 121
const HOUR_MS = 60 * 60 * 1000
const raw = (name) => getConnection().db.collection(name)

// 1° de latitud ≈ 111,2 km: puntos al norte del centro de Montevideo a distancias conocidas.
const METERS_PER_DEGREE_LAT = 111_195
const northOf = (meters) => ({ label: `A ${meters} m`, type: 'Point', coordinates: [MONTEVIDEO[0], MONTEVIDEO[1] + meters / METERS_PER_DEGREE_LAT] })

const startsIn = (hours) => new Date(NOW.getTime() + hours * HOUR_MS)
const ids = (plans) => plans.map((plan) => plan.id)
const nearby = (overrides = {}) => planRepo.findNearby({
  near: [...MONTEVIDEO], maxDistanceMeters: 10_000, filters: {}, asOf: NOW, limit: 200, ...overrides
})
const upcoming = (overrides = {}) => planRepo.listUpcoming({ filters: {}, now: NOW, after: null, limit: 50, ...overrides })

describe('findNearby ($geoNear)', () => {
  it('devuelve los planes dentro del radio, del más cercano al más lejano, con la distancia en metros', async () => {
    const at5km = await makePlan({ location: northOf(5_000) })
    const at1km = await makePlan({ location: northOf(1_000) })
    const at9km = await makePlan({ location: northOf(9_000) })
    await makePlan({ location: northOf(12_000) }) // fuera del radio de 10 km

    const found = await nearby()

    expect(ids(found)).toEqual([at1km.id, at5km.id, at9km.id])
    expect(found[0].distanceMeters).toBeGreaterThan(990)
    expect(found[0].distanceMeters).toBeLessThan(1_010)
    expect(found[1].distanceMeters).toBeGreaterThan(4_950)
    expect(found[1].distanceMeters).toBeLessThan(5_050)
    expect(found[2].distanceMeters).toBeGreaterThan(8_910)
    expect(found[2].distanceMeters).toBeLessThan(9_090)
  })

  it('respeta el radio pedido', async () => {
    const at1km = await makePlan({ location: northOf(1_000) })
    await makePlan({ location: northOf(5_000) })

    expect(ids(await nearby({ maxDistanceMeters: 2_000 }))).toEqual([at1km.id])
  })

  it('el tope de candidatos se queda con los más cercanos', async () => {
    const at3km = await makePlan({ location: northOf(3_000) })
    const at1km = await makePlan({ location: northOf(1_000) })
    await makePlan({ location: northOf(2_000) })

    const found = await nearby({ limit: 2 })

    expect(found).toHaveLength(2)
    expect(found[0].id).toBe(at1km.id)
    expect(ids(found)).not.toContain(at3km.id)
  })

  it('solo planes abiertos que empiezan después de asOf y que ya existían en ese momento', async () => {
    const visible = await makePlan({ location: northOf(1_000) })
    await makePlan({ location: northOf(1_000), status: 'closed' })
    await makePlan({ location: northOf(1_000), status: 'cancelled' })
    await makePlan({ location: northOf(1_000), startsAt: startsIn(-1) })
    const createdLater = await makePlan({ location: northOf(1_000) })
    await raw('plans').updateOne({ _id: createdLater._id }, { $set: { createdAt: startsIn(1) } })

    expect(ids(await nearby())).toEqual([visible.id])
  })

  it('aplica los filtros predefinidos', async () => {
    const paidFootball = await makePlan({ location: northOf(1_000), interests: ['futbol'], price: 300, university: 'um' })
    const freeCinema = await makePlan({ location: northOf(2_000), interests: ['cine'], price: 0, university: 'ort' })

    expect(ids(await nearby({ filters: { interests: ['cine'] } }))).toEqual([freeCinema.id])
    expect(ids(await nearby({ filters: { priceRanges: ['low'] } }))).toEqual([paidFootball.id])
    expect(ids(await nearby({ filters: { university: 'um' } }))).toEqual([paidFootball.id])
  })
})

describe('filtros de los listados', () => {
  it('fecha: from y to sobre startsAt', async () => {
    const day1 = await makePlan({ startsAt: startsIn(24) })
    const day3 = await makePlan({ startsAt: startsIn(72) })
    const day5 = await makePlan({ startsAt: startsIn(120) })

    expect(ids(await upcoming({ filters: { from: startsIn(48) } }))).toEqual([day3.id, day5.id])
    expect(ids(await upcoming({ filters: { to: startsIn(96) } }))).toEqual([day1.id, day3.id])
    expect(ids(await upcoming({ filters: { from: startsIn(48), to: startsIn(96) } }))).toEqual([day3.id])
  })

  it('intereses: el plan tiene al menos uno de los pedidos', async () => {
    const football = await makePlan({ startsAt: startsIn(1), interests: ['futbol', 'running'] })
    const cinema = await makePlan({ startsAt: startsIn(2), interests: ['cine'] })
    await makePlan({ startsAt: startsIn(3), interests: ['musica'] })

    expect(ids(await upcoming({ filters: { interests: ['running', 'cine'] } }))).toEqual([football.id, cinema.id])
  })

  it('precio: rangos gratis, $1–500, $501–1000 y más de $1000, combinables', async () => {
    const byPrice = {}
    let hour = 0
    for (const price of [0, 1, 500, 501, 1000, 1001, 100_000]) byPrice[price] = (await makePlan({ startsAt: startsIn(++hour), price })).id
    const withRanges = async (...priceRanges) => ids(await upcoming({ filters: { priceRanges } }))

    expect(await withRanges('free')).toEqual([byPrice[0]])
    expect(await withRanges('low')).toEqual([byPrice[1], byPrice[500]])
    expect(await withRanges('mid')).toEqual([byPrice[501], byPrice[1000]])
    expect(await withRanges('high')).toEqual([byPrice[1001], byPrice[100_000]])
    expect(await withRanges('free', 'low')).toEqual([byPrice[0], byPrice[1], byPrice[500]])
    expect(await withRanges('free', 'high')).toEqual([byPrice[0], byPrice[1001], byPrice[100_000]])
  })

  it('un rango de precio desconocido no filtra ni llega a MongoDB como operador', async () => {
    const plan = await makePlan({ startsAt: startsIn(1) })

    expect(ids(await upcoming({ filters: { priceRanges: [{ $gt: 0 }, 'inventado'] } }))).toEqual([plan.id])
  })

  it('cupo: por defecto solo los que tienen lugar; "full" solo los llenos', async () => {
    const withSpots = await makePlan({ startsAt: startsIn(1), capacity: 3, participantCount: 2 })
    const full = await makePlan({ startsAt: startsIn(2), capacity: 3, participantCount: 3 })

    expect(ids(await upcoming())).toEqual([withSpots.id])
    expect(ids(await upcoming({ filters: { availability: 'available' } }))).toEqual([withSpots.id])
    expect(ids(await upcoming({ filters: { availability: 'full' } }))).toEqual([full.id])
  })

  it('un plan con cupo ilimitado (capacity null) siempre tiene lugar y nunca aparece entre los llenos', async () => {
    const unlimited = await makePlan({ startsAt: startsIn(1), capacity: null, participantCount: 700 })

    expect(ids(await upcoming())).toEqual([unlimited.id])
    expect(await upcoming({ filters: { availability: 'full' } })).toEqual([])
    expect(ids(await nearby({ filters: { availability: 'available' } }))).toEqual([unlimited.id])
    expect(await nearby({ filters: { availability: 'full' } })).toEqual([])
  })
})

describe('listUpcoming (cursor cronológico)', () => {
  it('ordena por startsAt y, a igual fecha, por _id; el cursor no repite ni saltea', async () => {
    const sameTime = startsIn(5)
    const created = []
    for (const startsAt of [startsIn(9), sameTime, sameTime, sameTime, startsIn(2)]) created.push(await makePlan({ startsAt }))
    const expected = [created[4], created[1], created[2], created[3], created[0]].map((plan) => plan.id)

    const seen = []
    let after = null
    for (let page = 0; page < 5; page++) {
      const found = await upcoming({ after, limit: 2 })
      if (found.length === 0) break
      seen.push(...ids(found))
      const last = found.at(-1)
      after = { startsAt: last.startsAt, id: last.id }
    }

    expect(seen).toEqual(expected)
  })

  it('no trae planes que ya empezaron, cerrados ni cancelados', async () => {
    const open = await makePlan({ startsAt: startsIn(1) })
    await makePlan({ startsAt: startsIn(-1) })
    await makePlan({ startsAt: startsIn(1), status: 'closed' })
    await makePlan({ startsAt: startsIn(1), status: 'cancelled' })

    expect(ids(await upcoming())).toEqual([open.id])
  })
})

describe('create y findById', () => {
  it('crea el plan abierto y sin inscriptos, y lo devuelve como entidad plana', async () => {
    const creator = await makeUser()

    const plan = await planRepo.create({
      title: 'Partido', startsAt: startsIn(24), endsAt: startsIn(26), location: northOf(500), interests: ['futbol'], capacity: null, price: 0, creatorId: creator.id, university: 'um'
    })

    expect(plan).toMatchObject({ id: expect.any(String), creatorId: creator.id, participantCount: 0, status: 'open', capacity: null, price: 0, university: 'um' })
    expect(await planRepo.findById(plan.id)).toMatchObject({ id: plan.id, title: 'Partido' })
  })

  it('findById con un id inválido o inexistente → null', async () => {
    expect(await planRepo.findById('nope')).toBeNull()
    expect(await planRepo.findById({ $ne: null })).toBeNull()
    expect(await planRepo.findById(String(new mongoose.Types.ObjectId()))).toBeNull()
  })
})

describe('updateByCreator (actualización condicional)', () => {
  it('solo el creador: con otro usuario no cambia nada', async () => {
    const plan = await makePlan()
    const other = await makeUser()

    expect(await planRepo.updateByCreator(plan.id, other.id, { title: 'Hackeado' })).toBeNull()
    expect((await planRepo.findById(plan.id)).title).toBe(plan.title)
  })

  it('no baja el cupo por debajo de los inscriptos; exactamente igual sí', async () => {
    const plan = await makePlan({ capacity: 10, participantCount: 4 })
    const creatorId = String(plan.creatorId)

    expect(await planRepo.updateByCreator(plan.id, creatorId, { capacity: 3 })).toBeNull()
    expect((await planRepo.findById(plan.id)).capacity).toBe(10)
    expect((await planRepo.updateByCreator(plan.id, creatorId, { capacity: 4 })).capacity).toBe(4)
  })

  it('de un cupo a ilimitado y de ilimitado a un cupo (no menor a los inscriptos)', async () => {
    const plan = await makePlan({ capacity: 4, participantCount: 4 })
    const creatorId = String(plan.creatorId)

    expect((await planRepo.updateByCreator(plan.id, creatorId, { capacity: null })).capacity).toBeNull()
    await raw('plans').updateOne({ _id: plan._id }, { $set: { participantCount: 30 } })
    expect(await planRepo.updateByCreator(plan.id, creatorId, { capacity: 29 })).toBeNull()
    expect((await planRepo.updateByCreator(plan.id, creatorId, { capacity: 30 })).capacity).toBe(30)
  })

  it('no edita planes cancelados o completados, ni campos solo-backend', async () => {
    const cancelled = await makePlan({ status: 'cancelled' })
    const open = await makePlan()

    expect(await planRepo.updateByCreator(cancelled.id, String(cancelled.creatorId), { title: 'Otro título' })).toBeNull()
    const updated = await planRepo.updateByCreator(open.id, String(open.creatorId), { title: 'Otro título', participantCount: 99, status: 'completed', creatorId: 'x' })
    expect(updated).toMatchObject({ title: 'Otro título', participantCount: 0, status: 'open', creatorId: String(open.creatorId) })
  })
})

describe('inscripciones (lecturas)', () => {
  it('isActiveParticipant y findActivePlanIds solo cuentan inscripciones activas', async () => {
    const user = await makeUser()
    const joined = await makePlan()
    const left = await makePlan()
    await makeParticipation({ planId: joined._id, userId: user._id })
    await makeParticipation({ planId: left._id, userId: user._id, status: 'cancelled' })

    expect(await participationRepo.isActiveParticipant(joined.id, user.id)).toBe(true)
    expect(await participationRepo.isActiveParticipant(left.id, user.id)).toBe(false)
    expect(await participationRepo.findActivePlanIds(user.id)).toEqual([joined.id])
  })

  it('findSchedulesByIds devuelve el horario de los planes vigentes', async () => {
    const future = await makePlan({ startsAt: startsIn(24), endsAt: startsIn(26) })
    const finished = await makePlan({ startsAt: startsIn(-5), endsAt: startsIn(-3) })
    const cancelled = await makePlan({ startsAt: startsIn(24), status: 'cancelled' })

    const schedules = await planRepo.findSchedulesByIds([future.id, finished.id, cancelled.id, 'nope'], { endsAfter: NOW })

    expect(schedules).toEqual([{ id: future.id, startsAt: startsIn(24), endsAt: startsIn(26) }])
  })
})

describe('validador $jsonSchema de plans (sin pasar por Mongoose)', () => {
  const update = async ($set) => {
    const plan = await makePlan()
    return raw('plans').updateOne({ _id: plan._id }, { $set })
  }

  it.each([
    ['endsAt anterior a startsAt', { endsAt: new Date(Date.UTC(2029, 0, 1)) }],
    ['más de 7 días de duración', { endsAt: new Date(Date.UTC(2030, 0, 8, 18, 0, 1)) }],
    ['precio negativo', { price: -1 }],
    ['precio decimal', { price: 10.5 }],
    ['cupo 0', { capacity: 0 }],
    ['cupo mayor a 500', { capacity: 501 }],
    ['título de menos de 3 caracteres', { title: 'ab' }],
    ['sin nombre del lugar', { 'location.label': '' }],
    ['sin intereses', { interests: [] }],
    ['interés que no es una key', { interests: ['Fútbol'] }]
  ])('rechaza %s', async (_label, $set) => {
    await expect(update($set)).rejects.toMatchObject({ code: DOCUMENT_VALIDATION_FAILED })
  })

  it('acepta cupo ilimitado (null) con cualquier cantidad de inscriptos y 7 días exactos', async () => {
    await expect(update({ capacity: null, participantCount: 800 })).resolves.toMatchObject({ modifiedCount: 1 })
    await expect(update({ endsAt: new Date(Date.UTC(2030, 0, 8, 18)) })).resolves.toMatchObject({ modifiedCount: 1 })
  })
})

describe('migración de planes existentes', () => {
  it('completa endsAt (inicio + 2 h) y price (0) en los planes anteriores a S3', async () => {
    const { db } = getConnection()
    const validator = await import('../../migrations/20261012120100-plans-validator-ends-at-and-limits.js')
    const endsAt = await import('../../migrations/20261012120000-plans-backfill-ends-at.js')
    const price = await import('../../migrations/20261012120050-plans-backfill-price.js')
    await validator.down(db) // estado anterior: validador viejo, sin que cambie el changelog
    const creator = await makeUser()
    const startsAt = new Date('2026-11-01T21:00:00Z')
    const { insertedId } = await raw('plans').insertOne({
      title: 'Plan viejo', startsAt, location: { type: 'Point', coordinates: [...MONTEVIDEO] }, capacity: 5, participantCount: 0, creatorId: creator._id, status: 'open'
    })

    await endsAt.up(db)
    await price.up(db)
    await validator.up(db)

    expect(await raw('plans').findOne({ _id: insertedId })).toMatchObject({ endsAt: new Date('2026-11-01T23:00:00Z'), price: 0 })
  })
})
