// Contrato HTTP de /plans (S3-BE-01 a 04 y 08): crear, ver, editar, listar con filtros y foto del plan.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { makeParticipation, makePlan } from '../helpers/factories.js'
import { NOW, expectValidationError, hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'
import { Plan } from '../../src/modules/plans/index.js'

useTestDb()

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UNKNOWN_ID = '665f1c2a9b1e8a0012345678'
const ids = (res) => res.body.items.map((plan) => plan.id)

describe('POST /plans', () => {
  it('201 con el plan: creador del token, universidad del perfil, abierto y sin inscriptos', async () => {
    const { signUp } = setupApi()
    const ana = await signUp({ name: 'Ana' })

    const res = await ana.api.post('/plans', planBody({ price: 150 }))

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      title: 'Partido de fútbol',
      description: 'Actividad recreativa para estudiantes',
      startsAt: hoursFromNow(48).toISOString(),
      endsAt: hoursFromNow(50).toISOString(),
      location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
      interests: ['futbol'],
      university: 'um',
      capacity: 10,
      participantCount: 0,
      availableSpots: 10,
      isFull: false,
      price: 150,
      status: 'open',
      photoUrl: null,
      creator: { id: ana.id, name: 'Ana', photoUrl: null, reputation: 0 },
      isCreator: true,
      // La ventana de check-in la calcula el back: 15 min antes y 60 min después del comienzo.
      checkInOpensAt: new Date(hoursFromNow(48).getTime() - 15 * 60 * 1000).toISOString(),
      checkInClosesAt: hoursFromNow(49).toISOString(),
      checkInRadiusMeters: 150,
      myParticipation: null,
      createdAt: expect.stringMatching(ISO_UTC)
    })
  })

  it('crear un plan no consume cupo ni inscribe al creador', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const { body } = await ana.api.post('/plans', planBody({ capacity: 1 }))

    expect(body).toMatchObject({ participantCount: 0, availableSpots: 1, isFull: false })
  })

  it('acepta fechas con zona horaria y las devuelve en UTC', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const res = await ana.api.post('/plans', planBody({ startsAt: '2028-03-05T18:00:00-03:00', endsAt: '2028-03-05T20:30:00-03:00' }))

    expect(res.body).toMatchObject({ startsAt: '2028-03-05T21:00:00.000Z', endsAt: '2028-03-05T23:30:00.000Z' })
  })

  it('sin description, price ni capacity: descripción null, gratis y cupo ilimitado', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const { description, price, capacity, ...body } = planBody()

    const res = await ana.api.post('/plans', body)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ description: null, price: 0, capacity: null, availableSpots: null, isFull: false })
  })

  it('quien no tiene universidad en el perfil crea planes con university null', async () => {
    const { signUp } = setupApi()
    const ana = await signUp({ profile: { birthDate: '2001-03-09', interests: ['futbol'] } })

    expect((await ana.api.post('/plans', planBody())).body.university).toBeNull()
  })

  it('409 PROFILE_INCOMPLETE si el perfil no está completo', async () => {
    const { signUp } = setupApi()
    const nuevo = await signUp({ profile: null })

    const res = await nuevo.api.post('/plans', planBody())

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'PROFILE_INCOMPLETE', message: expect.any(String), requestId: expect.any(String) })
    expect(await Plan.countDocuments()).toBe(0)
  })

  it.each([
    ['creatorId', UNKNOWN_ID],
    ['participantCount', 5],
    ['university', 'ort'],
    ['status', 'completed'],
    ['photoKey', `plans/${UNKNOWN_ID}/a.jpg`],
    ['qrNonceHash', 'abc'],
    ['reputation', 10]
  ])('400 si el body trae el campo solo-backend %s', async (field, value) => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const res = await ana.api.post('/plans', planBody({ [field]: value }))

    expectValidationError(res, expect)
    expect(res.body.details).toEqual([{ path: field, message: expect.any(String) }])
    expect(await Plan.countDocuments()).toBe(0)
  })

  it.each([
    ['coordenadas fuera de rango', { location: { label: 'Lejos', coordinates: [-56.16, -134.9] } }, 'location.coordinates.1'],
    ['coordenadas como objeto', { location: { label: 'Lejos', coordinates: { $near: 1 } } }, 'location.coordinates'],
    ['sin nombre del lugar', { location: { coordinates: [-56.16, -34.9] } }, 'location.label'],
    ['capacity 0', { capacity: 0 }, 'capacity'],
    ['capacity negativa', { capacity: -3 }, 'capacity'],
    ['precio negativo', { price: -1 }, 'price'],
    ['sin intereses', { interests: [] }, 'interests'],
    ['fecha sin zona horaria', { startsAt: '2028-03-05T18:00:00' }, 'startsAt'],
    ['empieza en el pasado', { startsAt: hoursFromNow(-2).toISOString(), endsAt: hoursFromNow(1).toISOString() }, 'startsAt'],
    ['termina antes de empezar', { endsAt: hoursFromNow(47).toISOString() }, 'endsAt'],
    ['dura más de 7 días', { endsAt: hoursFromNow(48 + 7 * 24 + 1).toISOString() }, 'endsAt'],
    ['interés que no existe en el catálogo', { interests: ['paracaidismo-extremo'] }, 'interests'],
    ['operador de Mongo', { title: { $ne: null } }, 'title']
  ])('400 VALIDATION_ERROR: %s', async (_label, override, path) => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const res = await ana.api.post('/plans', planBody(override))

    expectValidationError(res, expect)
    expect(res.body.details.map((detail) => detail.path)).toContain(path)
    expect(await Plan.countDocuments()).toBe(0)
  })

  it('un interés con edad mínima exige que el creador la tenga', async () => {
    const { signUp } = setupApi()
    const minor = await signUp({ profile: { birthDate: '2011-01-10', interests: ['futbol'] } }) // 17 años en marzo de 2028
    const adult = await signUp()

    expectValidationError(await minor.api.post('/plans', planBody({ interests: ['bares-y-cervecerias'] })), expect)
    expect((await adult.api.post('/plans', planBody({ interests: ['bares-y-cervecerias'] }))).status).toBe(201)
  })

  it('401 sin token', async () => {
    const { anonymous } = setupApi()

    const res = await anonymous.post('/plans', planBody())

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('UNAUTHENTICATED')
  })
})

describe('GET /plans/:id', () => {
  it('200 con el detalle, los cupos disponibles y el creador; isCreator según quién mira', async () => {
    const { signUp } = setupApi()
    const ana = await signUp({ name: 'Ana' })
    const beto = await signUp({ name: 'Beto' })
    const plan = await makePlan({ creatorId: ana.id, capacity: 5, participantCount: 2, price: 300 })

    const res = await beto.api.get(`/plans/${plan.id}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: plan.id, capacity: 5, participantCount: 2, availableSpots: 3, isFull: false, price: 300, creator: { id: ana.id, name: 'Ana', photoUrl: null }, isCreator: false
    })
    expect((await ana.api.get(`/plans/${plan.id}`)).body.isCreator).toBe(true)
  })

  it('un plan lleno se ve completo, marcado como lleno', async () => {
    const { signUp } = setupApi()
    const beto = await signUp()
    const plan = await makePlan({ capacity: 3, participantCount: 3 })

    const res = await beto.api.get(`/plans/${plan.id}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ isFull: true, availableSpots: 0, title: plan.title, location: { label: 'Montevideo' } })
  })

  it('un plan con cupo ilimitado nunca está lleno', async () => {
    const { signUp } = setupApi()
    const beto = await signUp()
    const plan = await makePlan({ capacity: null, participantCount: 900 })

    expect((await beto.api.get(`/plans/${plan.id}`)).body).toMatchObject({ capacity: null, availableSpots: null, isFull: false, participantCount: 900 })
  })

  it('no expone campos internos ni datos privados del creador', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const plan = await makePlan({ creatorId: ana.id, photoKey: `plans/${UNKNOWN_ID}/a.jpg`, qrNonceHash: 'secreto' })

    const res = await ana.api.get(`/plans/${plan.id}`)

    expect(res.body.photoUrl).toEqual(expect.stringContaining('https://'))
    expect(JSON.stringify(res.body)).not.toMatch(/photoKey|qrNonceHash|secreto|passwordHash|birthDate|email|creatorId|"_id"/)
  })

  it('404 si no existe; 400 si el id no es válido', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()

    const missing = await ana.api.get(`/plans/${UNKNOWN_ID}`)
    const invalid = await ana.api.get('/plans/no-es-un-id')

    expect(missing.status).toBe(404)
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) })
    expectValidationError(invalid, expect)
  })

  it.each([
    ['cancelado', { status: 'cancelled' }],
    ['completado', { status: 'completed' }],
    ['ya terminado', { startsAt: hoursFromNow(-5), endsAt: hoursFromNow(-3) }]
  ])('un plan %s: 404 para un tercero, 200 para su creador y para un inscripto', async (_label, override) => {
    const { signUp } = setupApi()
    const [ana, beto, caro] = [await signUp(), await signUp(), await signUp()]
    const plan = await makePlan({ creatorId: ana.id, ...override })
    await makeParticipation({ planId: plan._id, userId: caro.id })

    expect((await beto.api.get(`/plans/${plan.id}`)).status).toBe(404)
    expect((await ana.api.get(`/plans/${plan.id}`)).status).toBe(200)
    expect((await caro.api.get(`/plans/${plan.id}`)).status).toBe(200)
  })

  it('401 sin token', async () => {
    const { anonymous } = setupApi()

    expect((await anonymous.get(`/plans/${UNKNOWN_ID}`)).status).toBe(401)
  })
})

describe('PATCH /plans/:id', () => {
  async function scenario (planOverrides = {}) {
    const api = setupApi()
    const ana = await api.signUp()
    const beto = await api.signUp()
    const plan = await makePlan({ creatorId: ana.id, startsAt: hoursFromNow(48), endsAt: hoursFromNow(50), ...planOverrides })
    return { ...api, ana, beto, plan, path: `/plans/${plan.id}` }
  }

  it('200: el creador edita campos sueltos y lo demás no cambia', async () => {
    const { ana, plan, path } = await scenario({ price: 100 })

    const res = await ana.api.patch(path, { title: 'Fútbol 5 mixto', price: 250, location: { label: 'Parque Rodó', coordinates: [-56.166, -34.913] } })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: plan.id, title: 'Fútbol 5 mixto', price: 250, location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.166, -34.913] }, capacity: 5, interests: ['futbol']
    })
    expect((await Plan.findById(plan.id)).title).toBe('Fútbol 5 mixto')
  })

  it('403 FORBIDDEN sobre un plan ajeno, y el plan no cambia', async () => {
    const { beto, plan, path } = await scenario()

    const res = await beto.api.patch(path, { title: 'Hackeado' })

    expect(res.status).toBe(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: expect.any(String), requestId: expect.any(String) })
    expect((await Plan.findById(plan.id)).title).toBe(plan.title)
  })

  it('404 si el plan no existe', async () => {
    const { ana } = await scenario()

    expect((await ana.api.patch(`/plans/${UNKNOWN_ID}`, { title: 'Otro título' })).status).toBe(404)
  })

  it('409 CAPACITY_BELOW_PARTICIPANTS al bajar el cupo por debajo de los inscriptos; igualarlo es válido', async () => {
    const { ana, plan, path } = await scenario({ capacity: 10, participantCount: 4 })

    const below = await ana.api.patch(path, { capacity: 3 })
    const equal = await ana.api.patch(path, { capacity: 4 })

    expect(below.status).toBe(409)
    expect(below.body).toMatchObject({ code: 'CAPACITY_BELOW_PARTICIPANTS', requestId: expect.any(String) })
    expect(equal.status).toBe(200)
    expect(equal.body).toMatchObject({ capacity: 4, availableSpots: 0, isFull: true })
    expect((await Plan.findById(plan.id)).capacity).toBe(4)
  })

  it('cupo ilimitado: se puede pasar a null y volver a un número que no sea menor a los inscriptos', async () => {
    const { ana, path } = await scenario({ capacity: 4, participantCount: 4 })

    const unlimited = await ana.api.patch(path, { capacity: null })
    const tooLow = await ana.api.patch(path, { capacity: 3 })
    const limited = await ana.api.patch(path, { capacity: 8 })

    expect(unlimited.body).toMatchObject({ capacity: null, availableSpots: null, isFull: false })
    expect(tooLow.status).toBe(409)
    expect(tooLow.body.code).toBe('CAPACITY_BELOW_PARTICIPANTS')
    expect(limited.body).toMatchObject({ capacity: 8, availableSpots: 4, isFull: false })
  })

  it('409 PLAN_CLOSED si el plan está cancelado', async () => {
    const { ana, path } = await scenario({ status: 'cancelled' })

    const res = await ana.api.patch(path, { title: 'Otro título' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PLAN_CLOSED')
  })

  it('las fechas se validan contra las guardadas: endsAt posterior a startsAt y hasta 7 días', async () => {
    const { ana, path } = await scenario()

    expectValidationError(await ana.api.patch(path, { endsAt: hoursFromNow(47).toISOString() }), expect)
    expectValidationError(await ana.api.patch(path, { endsAt: hoursFromNow(48 + 7 * 24 + 1).toISOString() }), expect)
    expectValidationError(await ana.api.patch(path, { startsAt: hoursFromNow(-1).toISOString() }), expect)
    expect((await ana.api.patch(path, { endsAt: hoursFromNow(48 + 7 * 24).toISOString() })).status).toBe(200)
  })

  it.each([
    ['body vacío', {}],
    ['creatorId', { creatorId: UNKNOWN_ID }],
    ['participantCount', { participantCount: 0 }],
    ['status completed (lo pone solo el back)', { status: 'completed' }],
    ['status junto con otros campos', { status: 'closed', title: 'Otro título' }],
    ['checkInOpensAt (la ventana la calcula el back)', { checkInOpensAt: '2028-03-03T14:45:00Z' }],
    ['radio de check-in fuera de rango', { checkInRadiusMeters: 20 }],
    ['university', { university: 'ort' }],
    ['capacity 0', { capacity: 0 }],
    ['interés inexistente', { interests: ['paracaidismo-extremo'] }]
  ])('400 VALIDATION_ERROR: %s', async (_label, body) => {
    const { ana, path } = await scenario()

    expectValidationError(await ana.api.patch(path, body), expect)
  })
})

describe('GET /plans (sin near: cronológico)', () => {
  it('200 con { items, nextCursor }: planes abiertos que no empezaron, por fecha, con la forma del detalle', async () => {
    const { signUp } = setupApi()
    const ana = await signUp({ name: 'Ana' })
    const beto = await signUp({ name: 'Beto' })
    const later = await makePlan({ creatorId: beto.id, startsAt: hoursFromNow(72) })
    const sooner = await makePlan({ creatorId: beto.id, startsAt: hoursFromNow(24) })
    await makePlan({ startsAt: hoursFromNow(-1) })
    await makePlan({ startsAt: hoursFromNow(24), status: 'closed' })
    await makePlan({ startsAt: hoursFromNow(24), status: 'cancelled' })

    const res = await ana.api.get('/plans')

    expect(res.status).toBe(200)
    expect(ids(res)).toEqual([sooner.id, later.id])
    expect(res.body.nextCursor).toBeNull()
    expect(res.body.items[0]).toMatchObject({ id: sooner.id, creator: { id: beto.id, name: 'Beto' }, isCreator: false, availableSpots: 5 })
    expect(res.body.items[0]).not.toHaveProperty('distanceMeters')
    expect(res.body.items[0]).not.toHaveProperty('myParticipation')
  })

  it('es para descubrir planes: no trae los que creó el usuario ni aquellos en los que ya está inscripto', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    await makePlan({ creatorId: ana.id, startsAt: hoursFromNow(24) })
    const joined = await makePlan({ startsAt: hoursFromNow(30) })
    const left = await makePlan({ startsAt: hoursFromNow(36) })
    const other = await makePlan({ startsAt: hoursFromNow(48) })
    await ana.api.post(`/plans/${joined.id}/join`)
    await ana.api.post(`/plans/${left.id}/join`)
    await ana.api.delete(`/plans/${left.id}/join`)

    const res = await ana.api.get('/plans')

    // Quien se dio de baja vuelve a verlo; otro usuario sigue viendo todos.
    expect(ids(res)).toEqual([left.id, other.id])
    expect((await (await signUp()).api.get('/plans')).body.items).toHaveLength(4)
  })

  it('paginación: recorre todo sin duplicados ni saltos y la última página trae nextCursor null', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const sameTime = hoursFromNow(30)
    const expected = []
    for (const startsAt of [hoursFromNow(10), hoursFromNow(20), sameTime, sameTime, sameTime, hoursFromNow(40), hoursFromNow(50)]) {
      expected.push((await makePlan({ startsAt })).id)
    }

    const seen = []
    let cursor = null
    let pages = 0
    do {
      const res = await ana.api.get(`/plans?limit=3${cursor ? `&cursor=${cursor}` : ''}`)
      expect(res.status).toBe(200)
      seen.push(...ids(res))
      cursor = res.body.nextCursor
      pages++
    } while (cursor && pages < 10)

    expect(seen).toEqual(expected)
    expect(pages).toBe(3)
  })

  it('filtros: fecha, universidad, intereses y varios rangos de precio a la vez', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const free = await makePlan({ startsAt: hoursFromNow(24), price: 0, interests: ['futbol'], university: 'um' })
    const cheap = await makePlan({ startsAt: hoursFromNow(48), price: 400, interests: ['cine'], university: 'ort' })
    const pricey = await makePlan({ startsAt: hoursFromNow(72), price: 1500, interests: ['running'], university: 'um' })
    const list = async (query) => ids(await ana.api.get(`/plans?${query}`))

    expect(await list('priceRanges=free')).toEqual([free.id])
    expect(await list('priceRanges=free,low')).toEqual([free.id, cheap.id])
    expect(await list('priceRanges=high')).toEqual([pricey.id])
    expect(await list('interests=cine,running')).toEqual([cheap.id, pricey.id])
    expect(await list('university=um')).toEqual([free.id, pricey.id])
    expect(await list(`from=${encodeURIComponent(hoursFromNow(36).toISOString())}`)).toEqual([cheap.id, pricey.id])
    expect(await list(`to=${encodeURIComponent(hoursFromNow(36).toISOString())}`)).toEqual([free.id])
    expect(await list('university=um&priceRanges=low,mid,high')).toEqual([pricey.id])
  })

  it('cupo: por defecto solo planes con lugar; availability=full trae los llenos (nunca los de cupo ilimitado)', async () => {
    const { signUp } = setupApi()
    const ana = await signUp()
    const withSpots = await makePlan({ startsAt: hoursFromNow(24), capacity: 3, participantCount: 1 })
    const full = await makePlan({ startsAt: hoursFromNow(48), capacity: 3, participantCount: 3 })
    const unlimited = await makePlan({ startsAt: hoursFromNow(72), capacity: null, participantCount: 50 })

    const available = await ana.api.get('/plans')
    const fullOnly = await ana.api.get('/plans?availability=full')

    expect(ids(available)).toEqual([withSpots.id, unlimited.id])
    expect(ids(fullOnly)).toEqual([full.id])
    expect(fullOnly.body.items[0]).toMatchObject({ isFull: true, availableSpots: 0 })
  })

  it.each([
    ['limit mayor a 100', 'limit=101'],
    ['limit 0', 'limit=0'],
    ['fecha inválida', 'from=ayer'],
    ['to anterior a from', 'from=2028-03-10T00:00:00Z&to=2028-03-05T00:00:00Z'],
    ['universidad con forma inválida', 'university=Universidad%20ORT'],
    ['rango de precio desconocido', 'priceRanges=barato'],
    ['availability desconocida', 'availability=todos'],
    ['radio sin near', 'radiusKm=5'],
    ['near inválido', 'near=montevideo'],
    ['radio fuera de rango', 'near=-56.16,-34.9&radiusKm=500'],
    ['filtro desconocido', 'status=cancelled'],
    ['operador de Mongo en el query', 'university[$ne]=um'],
    ['cursor manipulado', 'cursor=abc'],
    ['cursor con otra forma', `cursor=${Buffer.from('{"$gt":""}').toString('base64url')}`],
    // Un instante que no entra en un Date daría una fecha inválida (antes era un 500).
    ['cursor con un instante fuera de rango', `cursor=${Buffer.from('{"s":9007199254740991,"i":"0123456789abcdef01234567"}').toString('base64url')}`]
  ])('400 VALIDATION_ERROR: %s', async (_label, query) => {
    const { signUp } = setupApi()
    const ana = await signUp()

    expectValidationError(await ana.api.get(`/plans?${query}`), expect)
  })

  it('401 sin token', async () => {
    const { anonymous } = setupApi()

    expect((await anonymous.get('/plans')).status).toBe(401)
  })
})

describe('GET /plans/filters', () => {
  it('200 con los rangos de precio y el radio permitido (la app arma sus controles con esto)', async () => {
    const { signUp, anonymous } = setupApi()
    const ana = await signUp()

    const res = await ana.api.get('/plans/filters')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      priceRanges: [
        { key: 'free', min: 0, max: 0 },
        { key: 'low', min: 1, max: 500 },
        { key: 'mid', min: 501, max: 1000 },
        { key: 'high', min: 1001, max: null }
      ],
      radiusKm: { min: 0.5, max: 50, default: 10 }
    })
    expect((await anonymous.get('/plans/filters')).status).toBe(401)
  })
})

describe('foto del plan: POST /uploads/presign con planId + PUT /plans/:id/photo', () => {
  const image = { contentType: 'image/jpeg', sizeBytes: 1000 }

  async function scenario () {
    const api = setupApi()
    const ana = await api.signUp()
    const beto = await api.signUp()
    const plan = await makePlan({ creatorId: ana.id })
    return { ...api, ana, beto, plan }
  }

  it('el creador pide la URL (clave bajo plans/<planId>/), sube y vincula la foto', async () => {
    const { ana, plan, storage } = await scenario()

    const presign = await ana.api.post('/uploads/presign', { ...image, planId: plan.id })
    storage.putObject(presign.body.objectKey, image)
    const res = await ana.api.put(`/plans/${plan.id}/photo`, { objectKey: presign.body.objectKey })

    expect(presign.status).toBe(200)
    expect(presign.body.objectKey).toMatch(new RegExp(`^plans/${plan.id}/[0-9a-f-]{36}\\.jpg$`))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: plan.id, photoUrl: expect.stringContaining(presign.body.objectKey) })
    expect((await Plan.findById(plan.id)).photoKey).toBe(presign.body.objectKey)
  })

  it('otro usuario no puede pedir la URL ni vincular una foto: 403', async () => {
    const { ana, beto, plan, storage } = await scenario()
    const { body } = await ana.api.post('/uploads/presign', { ...image, planId: plan.id })
    storage.putObject(body.objectKey, image)

    const presign = await beto.api.post('/uploads/presign', { ...image, planId: plan.id })
    const link = await beto.api.put(`/plans/${plan.id}/photo`, { objectKey: body.objectKey })

    expect(presign.status).toBe(403)
    expect(link.status).toBe(403)
    expect((await Plan.findById(plan.id)).photoKey).toBeUndefined()
  })

  it('404 si el plan no existe; 400 si planId no es un id', async () => {
    const { ana } = await scenario()

    expect((await ana.api.post('/uploads/presign', { ...image, planId: UNKNOWN_ID })).status).toBe(404)
    expectValidationError(await ana.api.post('/uploads/presign', { ...image, planId: 'abc' }), expect)
  })

  it('una clave de otro plan o de un usuario → 403/400; un objeto que no se subió → 404', async () => {
    const { ana, plan } = await scenario()
    const put = (objectKey) => ana.api.put(`/plans/${plan.id}/photo`, { objectKey })

    expect((await put(`plans/${UNKNOWN_ID}/abc.jpg`)).status).toBe(403)
    expectValidationError(await put(`users/${ana.id}/abc.jpg`), expect)
    expect((await put(`plans/${plan.id}/abc.jpg`)).status).toBe(404)
  })
})

describe('reloj de los tests', () => {
  it('es posterior a la fecha real (las factories crean planes "hoy")', () => {
    expect(NOW.getTime()).toBeGreaterThan(Date.now())
  })
})
