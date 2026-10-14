// Contrato HTTP del feed por cercanía (S3-BE-05 a 07): POST /feed (con calendario) y GET /plans?near= (sin calendario).
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { MONTEVIDEO, makeParticipation, makePlan } from '../helpers/factories.js'
import { expectValidationError, hoursFromNow, northOf, setupApi } from '../helpers/plans-api.js'

useTestDb()

const NEAR = [...MONTEVIDEO]
const NEAR_QUERY = `near=${MONTEVIDEO[0]},${MONTEVIDEO[1]}`
const ids = (res) => res.body.items.map((plan) => plan.id)
const calendar = (busy = []) => ({ from: hoursFromNow(0).toISOString(), to: hoursFromNow(30 * 24).toISOString(), busy })
const slot = (fromHours, toHours) => ({ start: hoursFromNow(fromHours).toISOString(), end: hoursFromNow(toHours).toISOString() })

describe('POST /feed', () => {
  it('200: el plan con los mismos intereses y cerca queda primero; cada plan trae su distancia', async () => {
    const { signUp } = setupApi()
    const ana = await signUp() // intereses: futbol
    const nearestButUnrelated = await makePlan({ location: northOf(300), interests: ['cine'] })
    const matching = await makePlan({ location: northOf(800), interests: ['futbol'] })
    const far = await makePlan({ location: northOf(9_000), interests: ['cine'] })
    await makePlan({ location: northOf(12_000), interests: ['futbol'] }) // fuera del radio por defecto (10 km)

    const res = await ana.api.post('/feed', { near: NEAR })

    expect(res.status).toBe(200)
    expect(ids(res)).toEqual([matching.id, nearestButUnrelated.id, far.id])
    expect(res.body.nextCursor).toBeNull()
    expect(res.body.items[0]).toMatchObject({ id: matching.id, title: matching.title, isFull: false, creator: { id: expect.any(String) }, isCreator: false })
    expect(res.body.items[0].distanceMeters).toBeGreaterThan(790)
    expect(res.body.items[0].distanceMeters).toBeLessThan(810)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('no recomienda los planes que creó el usuario ni aquellos en los que ya está inscripto (tampoco con GET /plans?near=)', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    await makePlan({ creatorId: ana.id, location: northOf(100) })
    const joined = await makePlan({ location: northOf(200) })
    const other = await makePlan({ location: northOf(300) })
    await ana.api.post(`/plans/${joined.id}/join`)

    const feed = await ana.api.post('/feed', { near: NEAR })
    const list = await ana.api.get(`/plans?${NEAR_QUERY}`)

    expect(ids(feed)).toEqual([other.id])
    expect(ids(list)).toEqual([other.id])
    expect((await (await signUp()).api.post('/feed', { near: NEAR })).body.items).toHaveLength(3)
  })

  it('radiusKm limita los candidatos', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const close = await makePlan({ location: northOf(800) })
    const farther = await makePlan({ location: northOf(3_000) })

    expect(ids(await ana.api.post('/feed', { near: NEAR, radiusKm: 1 }))).toEqual([close.id])
    expect(ids(await ana.api.post('/feed', { near: NEAR, radiusKm: 50 }))).toEqual([close.id, farther.id])
  })

  it('cambiar los pesos en la configuración cambia el orden sin cambiar el contrato', async () => {
    const byDistance = setupApi({ feedWeights: { interests: 0, distance: 1, schedule: 0 } })
    const ana = await byDistance.signUp()
    const nearestButUnrelated = await makePlan({ location: northOf(300), interests: ['cine'] })
    const matching = await makePlan({ location: northOf(800), interests: ['futbol'] })

    expect(ids(await ana.api.post('/feed', { near: NEAR }))).toEqual([nearestButUnrelated.id, matching.id])
  })

  it('paginación por ranking: sin duplicados ni saltos, y la última página trae nextCursor null', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const expected = []
    for (let i = 1; i <= 7; i++) expected.push((await makePlan({ location: northOf(i * 500) })).id)

    const seen = []
    let cursor
    let pages = 0
    do {
      const res = await ana.api.post('/feed', { near: NEAR, limit: 3, ...(cursor ? { cursor } : {}) })
      expect(res.status).toBe(200)
      seen.push(...ids(res))
      cursor = res.body.nextCursor
      pages++
    } while (cursor && pages < 10)

    expect(seen).toEqual(expected)
    expect(pages).toBe(3)
  })

  it('un plan creado entre páginas no desordena el recorrido (aparece al refrescar)', async () => {
    const { signUp, clock } = setupApi()
    const ana = await signUp()
    const original = []
    for (let i = 1; i <= 4; i++) original.push((await makePlan({ location: northOf(i * 500) })).id)
    const first = await ana.api.post('/feed', { near: NEAR, limit: 2 })

    clock.advance(60_000)
    const newcomer = await makePlan({ location: northOf(100), createdAt: clock.now() })
    const second = await ana.api.post('/feed', { near: NEAR, limit: 2, cursor: first.body.nextCursor })
    const refreshed = await ana.api.post('/feed', { near: NEAR, limit: 2 })

    expect([...ids(first), ...ids(second)]).toEqual(original)
    expect(ids(refreshed)[0]).toBe(newcomer.id)
  })

  it('400 si el cursor trae un instante fuera de rango (no un 500)', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const cursor = Buffer.from(JSON.stringify({ o: 1, t: 9007199254740991, f: '0123456789abcdef' })).toString('base64url')

    expectValidationError(await ana.api.post('/feed', { near: NEAR, cursor }), expect)
  })

  it('400 si el cursor es de otra búsqueda', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    for (let i = 1; i <= 3; i++) await makePlan({ location: northOf(i * 500) })
    const { body } = await ana.api.post('/feed', { near: NEAR, limit: 2 })

    expectValidationError(await ana.api.post('/feed', { near: NEAR, limit: 2, radiusKm: 5, cursor: body.nextCursor }), expect)
  })

  it('filtros predefinidos: intereses, precio y cupo (los llenos van aparte)', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const freeFootball = await makePlan({ location: northOf(500), interests: ['futbol'], price: 0 })
    const paidCinema = await makePlan({ location: northOf(600), interests: ['cine'], price: 700 })
    const full = await makePlan({ location: northOf(700), interests: ['futbol'], capacity: 2, participantCount: 2 })
    const feed = async (filters) => ids(await ana.api.post('/feed', { near: NEAR, ...filters }))

    expect(await feed({})).toEqual([freeFootball.id, paidCinema.id])
    expect(await feed({ interests: ['cine'] })).toEqual([paidCinema.id])
    expect(await feed({ priceRanges: ['free', 'low'] })).toEqual([freeFootball.id])
    expect(await feed({ priceRanges: ['mid'] })).toEqual([paidCinema.id])
    expect(await feed({ availability: 'full' })).toEqual([full.id])
  })

  describe('compatibilidad horaria', () => {
    // Solo pesa el horario: así el orden depende únicamente de H(u, p).
    const scheduleOnly = { feedWeights: { interests: 0, distance: 0, schedule: 1 } }

    async function scenario () {
      const api = setupApi(scheduleOnly)
      const ana = await api.signUp()
      const day2 = await makePlan({ location: northOf(500), startsAt: hoursFromNow(48), endsAt: hoursFromNow(50) })
      const day4 = await makePlan({ location: northOf(600), startsAt: hoursFromNow(96), endsAt: hoursFromNow(98) })
      return { ...api, ana, day2, day4 }
    }

    it('sin calendario el horario es neutral: decide la cercanía', async () => {
      const { ana, day2, day4 } = await scenario()

      expect(ids(await ana.api.post('/feed', { near: NEAR }))).toEqual([day2.id, day4.id])
    })

    it('con calendario, un plan que se superpone con una franja ocupada queda después', async () => {
      const { ana, day2, day4 } = await scenario()

      const res = await ana.api.post('/feed', { near: NEAR, calendar: calendar([slot(49, 49.5)]) })

      expect(ids(res)).toEqual([day4.id, day2.id])
    })

    it('los planes en los que ya está inscripto cuentan como ocupados aunque no mande calendario', async () => {
      const { ana, day2, day4 } = await scenario()
      const joined = await makePlan({ location: northOf(40_000), startsAt: hoursFromNow(47), endsAt: hoursFromNow(49) })
      await makeParticipation({ planId: joined._id, userId: ana.id })

      expect(ids(await ana.api.post('/feed', { near: NEAR }))).toEqual([day4.id, day2.id])
    })
  })

  it.each([
    ['sin near', {}],
    ['near como texto', { near: '-56.16,-34.9' }],
    ['near fuera de rango', { near: [-56.16, -91] }],
    ['near como objeto GeoJSON', { near: { type: 'Point', coordinates: NEAR } }],
    ['radio menor al mínimo', { near: NEAR, radiusKm: 0.1 }],
    ['radio mayor al máximo', { near: NEAR, radiusKm: 51 }],
    ['limit mayor a 100', { near: NEAR, limit: 101 }],
    ['rango de precio desconocido', { near: NEAR, priceRanges: ['barato'] }],
    ['intereses como texto', { near: NEAR, interests: 'futbol' }],
    ['filtro desconocido', { near: NEAR, status: 'cancelled' }],
    ['operador de Mongo', { near: NEAR, university: { $ne: 'um' } }],
    ['identidad en el body', { near: NEAR, userId: '665f1c2a9b1e8a0012345678' }],
    ['calendario sin período', { near: NEAR, calendar: { busy: [] } }],
    ['calendario de más de 31 días', { near: NEAR, calendar: { from: hoursFromNow(0).toISOString(), to: hoursFromNow(32 * 24).toISOString(), busy: [] } }],
    ['franja que termina antes de empezar', { near: NEAR, calendar: calendar([slot(5, 4)]) }],
    ['franja con datos del evento', { near: NEAR, calendar: calendar([{ ...slot(4, 5), title: 'Médico' }]) }],
    ['franja sin zona horaria', { near: NEAR, calendar: calendar([{ start: '2028-03-02T10:00:00', end: '2028-03-02T11:00:00' }]) }],
    ['más de 200 franjas', { near: NEAR, calendar: calendar(Array.from({ length: 201 }, (_, i) => slot(i, i + 0.5))) }]
  ])('400 VALIDATION_ERROR: %s', async (_label, body) => {
    const { signUp } = setupApi()
    const ana = await signUp()

    expectValidationError(await ana.api.post('/feed', body), expect)
  })

  it('acepta hasta 200 franjas', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const res = await ana.api.post('/feed', { near: NEAR, calendar: calendar(Array.from({ length: 200 }, (_, i) => slot(i, i + 0.5))) })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [], nextCursor: null })
  })

  it('401 sin token', async () => {
    const { anonymous } = setupApi()

    expect((await anonymous.post('/feed', { near: NEAR })).status).toBe(401)
  })
})

describe('GET /plans?near= (feed sin calendario)', () => {
  it('ordena por recomendación, igual que POST /feed, y pagina con el mismo tipo de cursor', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const nearestButUnrelated = await makePlan({ location: northOf(300), interests: ['cine'] })
    const matching = await makePlan({ location: northOf(800), interests: ['futbol'] })
    await makePlan({ location: northOf(3_000), interests: ['futbol'] })

    const first = await ana.api.get(`/plans?${NEAR_QUERY}&radiusKm=2&limit=1`)
    const second = await ana.api.get(`/plans?${NEAR_QUERY}&radiusKm=2&limit=1&cursor=${first.body.nextCursor}`)

    expect(first.status).toBe(200)
    expect(ids(first)).toEqual([matching.id])
    expect(first.body.items[0].distanceMeters).toEqual(expect.any(Number))
    expect(ids(second)).toEqual([nearestButUnrelated.id])
    expect(second.body.nextCursor).toBeNull()
  })

  it('acepta los mismos filtros que el listado cronológico', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    await makePlan({ location: northOf(300), price: 0 })
    const paid = await makePlan({ location: northOf(800), price: 2_000 })

    expect(ids(await ana.api.get(`/plans?${NEAR_QUERY}&priceRanges=high`))).toEqual([paid.id])
  })
})
