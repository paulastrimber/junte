// Contrato del QR y del check-in (S4-BE-04 y 06): bloque "Check-in" de docs/practicas/testing.md.
import { describe, expect, it } from 'vitest'
import { getConnection } from '../../src/adapters/db/index.js'
import { useTestDb } from '../helpers/db.js'
import { checkInBody, expectError, expectValidationError, hoursFromNow, planBody, pointNorthOf, setupApi } from '../helpers/plans-api.js'
import { CheckIn } from '../../src/modules/checkins/checkin.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { User } from '../../src/modules/users/user.model.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'
const MINUTE_MS = 60 * 1000
// El plan de `planBody` empieza 48 h después del reloj de los tests y dura 2 h.
const STARTS_AT = hoursFromNow(48)
const WINDOW_OPENS_AT = new Date(STARTS_AT.getTime() - 15 * MINUTE_MS)
const WINDOW_CLOSES_AT = new Date(STARTS_AT.getTime() + 60 * MINUTE_MS)

const reputationOf = async (user) => (await User.findById(user.id)).reputation

/**
 * Ana crea un plan y Beto se inscribe. Con `at`, el reloj salta a ese momento (y se renuevan las sesiones).
 * @param {{ at?: Date | null, plan?: object, joinCreator?: boolean }} [options]
 */
async function scenario ({ at = STARTS_AT, plan: planOverrides = {}, joinCreator = false } = {}) {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const { body: plan } = await ana.api.post('/plans', planBody(planOverrides))
  await beto.api.post(`/plans/${plan.id}/join`)
  if (joinCreator) await ana.api.post(`/plans/${plan.id}/join`)
  if (at) await api.travelTo(at, ana, beto)

  const qrPath = `/plans/${plan.id}/qr`
  const checkInPath = `/plans/${plan.id}/check-in`
  const newQr = async () => (await ana.api.post(qrPath)).body.qrToken
  return { ...api, ana, beto, plan, qrPath, checkInPath, newQr }
}

describe('POST /plans/:id/qr', () => {
  it('201 con el desafío y su vencimiento (90 s); no lo cachea nadie', async () => {
    const { ana, plan, qrPath } = await scenario()

    const res = await ana.api.post(qrPath)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      qrToken: expect.stringMatching(new RegExp(`^${plan.id}\\.[A-Za-z0-9_-]{43}$`)),
      expiresAt: new Date(STARTS_AT.getTime() + 90 * 1000).toISOString()
    })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('guarda solo el hash del nonce, nunca el token', async () => {
    const { ana, plan, qrPath } = await scenario()

    const { body } = await ana.api.post(qrPath)

    const stored = await Plan.findById(plan.id).lean()
    expect(stored.qrNonceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain(body.qrToken.split('.')[1])
    expect(JSON.stringify((await ana.api.get(`/plans/${plan.id}`)).body)).not.toMatch(/qrNonceHash|qrToken|qrExpiresAt/)
  })

  it('el QR nunca vence después de que cierra la ventana de check-in', async () => {
    const { ana, qrPath } = await scenario({ at: new Date(WINDOW_CLOSES_AT.getTime() - 30 * 1000) })

    const { body } = await ana.api.post(qrPath)

    expect(body.expiresAt).toBe(WINDOW_CLOSES_AT.toISOString())
  })

  it('403 si no es el creador, aunque esté inscripto', async () => {
    const { beto, qrPath } = await scenario()

    expectError(await beto.api.post(qrPath), expect, 403, 'FORBIDDEN')
  })

  it.each([
    ['un segundo antes de que abra la ventana', new Date(WINDOW_OPENS_AT.getTime() - 1000)],
    ['un segundo después de que cierra', new Date(WINDOW_CLOSES_AT.getTime() + 1000)]
  ])('409 CHECKIN_WINDOW_CLOSED %s', async (_label, at) => {
    const { ana, qrPath } = await scenario({ at })

    expectError(await ana.api.post(qrPath), expect, 409, 'CHECKIN_WINDOW_CLOSED')
  })

  it('funciona exactamente al abrir la ventana y con las inscripciones cerradas', async () => {
    const { travelTo, ana, plan, qrPath } = await scenario({ at: null })
    await ana.api.patch(`/plans/${plan.id}`, { status: 'closed' })
    await travelTo(WINDOW_OPENS_AT, ana)

    expect((await ana.api.post(qrPath)).status).toBe(201)
  })

  it('409 PLAN_CLOSED si el plan está cancelado', async () => {
    const { ana, plan, qrPath } = await scenario()
    await ana.api.patch(`/plans/${plan.id}`, { status: 'cancelled' })

    expectError(await ana.api.post(qrPath), expect, 409, 'PLAN_CLOSED')
  })

  it('401 sin token; 404 si el plan no existe', async () => {
    const { anonymous, ana, qrPath } = await scenario()

    expectError(await anonymous.post(qrPath), expect, 401, 'UNAUTHENTICATED')
    expectError(await ana.api.post(`/plans/${UNKNOWN_ID}/qr`), expect, 404, 'NOT_FOUND')
  })
})

describe('POST /plans/:id/check-in', () => {
  it('201 con la asistencia; suma +1 de reputación y el detalle la refleja', async () => {
    const { beto, plan, checkInPath, newQr } = await scenario()

    const res = await beto.api.post(checkInPath, checkInBody({ qrToken: await newQr() }))

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ planId: plan.id, checkedInAt: STARTS_AT.toISOString(), method: 'qr-location', distanceMeters: 0 })
    expect(await reputationOf(beto)).toBe(1)
    expect((await beto.api.get(`/plans/${plan.id}`)).body.myParticipation).toMatchObject({ checkedInAt: STARTS_AT.toISOString(), noShow: false })
    expect((await beto.api.get('/users/me')).body.reputation).toBe(1)
  })

  it('la ubicación exacta NO queda guardada: solo la distancia y la precisión', async () => {
    const { beto, plan, checkInPath, newQr } = await scenario()

    await beto.api.post(checkInPath, checkInBody({ ...pointNorthOf(40), accuracyMeters: 12, qrToken: await newQr() }))

    const [stored] = await getConnection().db.collection('checkIns').find({}).toArray()
    expect(Object.keys(stored).sort()).toEqual(['__v', '_id', 'accuracyMeters', 'checkedInAt', 'createdAt', 'distanceMeters', 'method', 'planId', 'updatedAt', 'userId'])
    expect(stored.distanceMeters).toBeGreaterThan(39)
    expect(stored.distanceMeters).toBeLessThan(41)
    expect(stored.accuracyMeters).toBe(12)
    expect(String(stored.planId)).toBe(plan.id)
    expect(JSON.stringify(stored)).not.toMatch(/-34\.|-56\.|latitude|longitude|coordinates/)
  })

  describe('QR', () => {
    it('403 QR_INVALID con un QR vencido', async () => {
      const { travelTo, ana, beto, checkInPath, newQr } = await scenario()
      const qrToken = await newQr()
      await travelTo(new Date(STARTS_AT.getTime() + 91 * 1000), ana, beto)

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken })), expect, 403, 'QR_INVALID')
      expect(await CheckIn.countDocuments()).toBe(0)
      expect(await reputationOf(beto)).toBe(0)
    })

    it('vale hasta el instante exacto en que vence', async () => {
      const { travelTo, ana, beto, checkInPath, newQr } = await scenario()
      const qrToken = await newQr()
      await travelTo(new Date(STARTS_AT.getTime() + 90 * 1000), ana, beto)

      expect((await beto.api.post(checkInPath, checkInBody({ qrToken }))).status).toBe(201)
    })

    it('403 QR_INVALID con el QR de otro plan', async () => {
      const { ana, beto, checkInPath, newQr } = await scenario()
      await newQr()
      const { body: other } = await ana.api.post('/plans', planBody({ title: 'Otro plan', startsAt: new Date(STARTS_AT.getTime() + 10 * MINUTE_MS).toISOString(), endsAt: hoursFromNow(51).toISOString() }))
      const otherQr = (await ana.api.post(`/plans/${other.id}/qr`)).body.qrToken

      expect(otherQr).toEqual(expect.any(String))
      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken: otherQr })), expect, 403, 'QR_INVALID')
    })

    it('un QR nuevo invalida el anterior', async () => {
      const { beto, checkInPath, newQr } = await scenario()
      const previous = await newQr()
      const current = await newQr()

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken: previous })), expect, 403, 'QR_INVALID')
      expect((await beto.api.post(checkInPath, checkInBody({ qrToken: current }))).status).toBe(201)
    })

    it.each([
      ['falta', undefined],
      ['es solo el ID del plan', 'PLAN_ID'],
      ['tiene un nonce inventado', 'PLAN_ID.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
      ['no tiene la forma esperada', 'cualquier-cosa']
    ])('403 QR_INVALID si el QR %s', async (_label, template) => {
      const { beto, plan, checkInPath, newQr } = await scenario()
      await newQr()
      const qrToken = template?.replace('PLAN_ID', plan.id)

      expectError(await beto.api.post(checkInPath, checkInBody(qrToken === undefined ? {} : { qrToken })), expect, 403, 'QR_INVALID')
    })

    it('403 QR_INVALID si el creador todavía no generó ningún QR', async () => {
      const { beto, plan, checkInPath } = await scenario()

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken: `${plan.id}.${'A'.repeat(43)}` })), expect, 403, 'QR_INVALID')
    })
  })

  describe('inscripción', () => {
    it('403 FORBIDDEN si nunca se inscribió', async () => {
      const { signUp, checkInPath, newQr } = await scenario()
      const caro = await signUp({ name: 'Caro' })

      expectError(await caro.api.post(checkInPath, checkInBody({ qrToken: await newQr() })), expect, 403, 'FORBIDDEN')
    })

    it('403 FORBIDDEN si se dio de baja (inscripción inactiva)', async () => {
      const { travelTo, ana, beto, plan, checkInPath, newQr } = await scenario({ at: null })
      await beto.api.delete(`/plans/${plan.id}/join`)
      await travelTo(STARTS_AT, ana, beto)

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken: await newQr() })), expect, 403, 'FORBIDDEN')
      expect(await CheckIn.countDocuments()).toBe(0)
    })
  })

  describe('ubicación', () => {
    it('403 OUT_OF_RANGE fuera del radio', async () => {
      const { beto, checkInPath, newQr } = await scenario()

      const res = await beto.api.post(checkInPath, checkInBody({ ...pointNorthOf(151), qrToken: await newQr() }))

      expectError(res, expect, 403, 'OUT_OF_RANGE')
      expect(await reputationOf(beto)).toBe(0)
    })

    it('acepta dentro del radio, también con el radio que eligió el creador', async () => {
      const { beto, checkInPath, newQr } = await scenario({ plan: { checkInRadiusMeters: 500 } })

      const res = await beto.api.post(checkInPath, checkInBody({ ...pointNorthOf(480), qrToken: await newQr() }))

      expect(res.status).toBe(201)
      expect(res.body.distanceMeters).toBeGreaterThan(470)
    })

    it('403 OUT_OF_RANGE con una precisión de GPS peor que 100 m, aunque esté en el lugar', async () => {
      const { beto, checkInPath, newQr } = await scenario()

      expectError(await beto.api.post(checkInPath, checkInBody({ accuracyMeters: 101, qrToken: await newQr() })), expect, 403, 'OUT_OF_RANGE')
    })

    it('acepta una precisión de exactamente 100 m', async () => {
      const { beto, checkInPath, newQr } = await scenario()

      expect((await beto.api.post(checkInPath, checkInBody({ accuracyMeters: 100, qrToken: await newQr() }))).status).toBe(201)
    })
  })

  describe('horario', () => {
    it('409 CHECKIN_WINDOW_CLOSED después de que cierra la ventana, aunque el QR sea el vigente', async () => {
      const { travelTo, ana, beto, plan, checkInPath } = await scenario({ at: WINDOW_CLOSES_AT })
      const qrToken = (await ana.api.post(`/plans/${plan.id}/qr`)).body.qrToken
      await travelTo(new Date(WINDOW_CLOSES_AT.getTime() + 1000), ana, beto)

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken })), expect, 409, 'CHECKIN_WINDOW_CLOSED')
    })

    it('409 CHECKIN_WINDOW_CLOSED un segundo antes de que abra', async () => {
      const { beto, plan, checkInPath } = await scenario({ at: new Date(WINDOW_OPENS_AT.getTime() - 1000) })

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken: `${plan.id}.${'A'.repeat(43)}` })), expect, 409, 'CHECKIN_WINDOW_CLOSED')
    })

    it('acepta exactamente al abrir la ventana (15 minutos antes de que empiece)', async () => {
      const { beto, checkInPath, newQr } = await scenario({ at: WINDOW_OPENS_AT })

      expect((await beto.api.post(checkInPath, checkInBody({ qrToken: await newQr() }))).status).toBe(201)
    })

    it('409 PLAN_CLOSED si el plan fue cancelado', async () => {
      const { ana, beto, plan, checkInPath, newQr } = await scenario()
      const qrToken = await newQr()
      await ana.api.patch(`/plans/${plan.id}`, { status: 'cancelled' })

      expectError(await beto.api.post(checkInPath, checkInBody({ qrToken })), expect, 409, 'PLAN_CLOSED')
    })
  })

  it('segundo check-in → 409 ALREADY_CHECKED_IN; la reputación sube una sola vez', async () => {
    const { beto, checkInPath, newQr } = await scenario()
    const qrToken = await newQr()
    await beto.api.post(checkInPath, checkInBody({ qrToken }))

    expectError(await beto.api.post(checkInPath, checkInBody({ qrToken })), expect, 409, 'ALREADY_CHECKED_IN')
    expect(await CheckIn.countDocuments()).toBe(1)
    expect(await reputationOf(beto)).toBe(1)
  })

  it('dos check-ins simultáneos del mismo usuario: uno solo queda y suma +1', async () => {
    const { beto, checkInPath, newQr } = await scenario()
    const body = checkInBody({ qrToken: await newQr() })

    const results = await Promise.all([beto.api.post(checkInPath, body), beto.api.post(checkInPath, body)])

    expect(results.map((res) => res.status).sort()).toEqual([201, 409])
    expect(await CheckIn.countDocuments()).toBe(1)
    expect(await reputationOf(beto)).toBe(1)
  })

  describe('creador inscripto', () => {
    it('registra su asistencia sin QR, solo con ubicación, y no suma reputación en el momento', async () => {
      const { ana, plan, checkInPath } = await scenario({ joinCreator: true })

      const res = await ana.api.post(checkInPath, checkInBody())

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ planId: plan.id, method: 'location' })
      expect(await reputationOf(ana)).toBe(0)
    })

    it('igual se le exige la ventana, la distancia y la precisión', async () => {
      const { ana, checkInPath } = await scenario({ joinCreator: true })

      expectError(await ana.api.post(checkInPath, checkInBody(pointNorthOf(300))), expect, 403, 'OUT_OF_RANGE')
      expectError(await ana.api.post(checkInPath, checkInBody({ accuracyMeters: 500 })), expect, 403, 'OUT_OF_RANGE')
    })

    it('403 FORBIDDEN si el creador no se inscribió en su propio plan', async () => {
      const { ana, checkInPath } = await scenario()

      expectError(await ana.api.post(checkInPath, checkInBody()), expect, 403, 'FORBIDDEN')
    })
  })

  it.each([
    ['sin latitud', { latitude: undefined }],
    ['latitud fuera de rango', { latitude: -91 }],
    ['longitud fuera de rango', { longitude: 181 }],
    ['precisión negativa', { accuracyMeters: -1 }],
    ['sin precisión', { accuracyMeters: undefined }],
    ['coordenadas como texto', { latitude: '-34.9' }],
    ['userId en el body', { userId: UNKNOWN_ID }],
    ['distanceMeters en el body', { distanceMeters: 0 }],
    ['un operador de Mongo', { qrToken: { $ne: null } }]
  ])('400 VALIDATION_ERROR: %s', async (_label, override) => {
    const { beto, checkInPath, newQr } = await scenario()

    expectValidationError(await beto.api.post(checkInPath, { ...checkInBody({ qrToken: await newQr() }), ...override }), expect)
    expect(await CheckIn.countDocuments()).toBe(0)
  })

  it('401 sin token; 404 si el plan no existe', async () => {
    const { anonymous, beto, checkInPath } = await scenario()

    expectError(await anonymous.post(checkInPath, checkInBody()), expect, 401, 'UNAUTHENTICATED')
    expectError(await beto.api.post(`/plans/${UNKNOWN_ID}/check-in`, checkInBody()), expect, 404, 'NOT_FOUND')
  })
})
