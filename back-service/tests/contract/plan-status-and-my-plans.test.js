// Contrato de los cambios de estado del creador (PATCH /plans/:id { status }), del radio de check-in,
// de "Mis planes" (GET /users/me/plans) y de las ausencias propias (noShowCount en GET /users/me).
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { checkInBody, expectError, expectValidationError, hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'
import { Participation } from '../../src/modules/participations/participation.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'

useTestDb()

const MINUTE_MS = 60 * 1000
const STARTS_AT = hoursFromNow(48)
const ENDS_AT = hoursFromNow(50)

async function scenario (overrides = {}) {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const { body: plan } = await ana.api.post('/plans', planBody(overrides))
  return { ...api, ana, beto, plan, path: `/plans/${plan.id}` }
}

describe('PATCH /plans/:id { status }', () => {
  it('el creador cierra y reabre las inscripciones', async () => {
    const { ana, path } = await scenario()

    const closed = await ana.api.patch(path, { status: 'closed' })
    const reopened = await ana.api.patch(path, { status: 'open' })

    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ status: 'closed', isCreator: true })
    expect(reopened.body).toMatchObject({ status: 'open' })
  })

  it('cerrar las inscripciones no marca noShow a nadie', async () => {
    const { ana, beto, plan, path } = await scenario()
    await beto.api.post(`${path}/join`)

    await ana.api.patch(path, { status: 'closed' })

    expect(await Participation.findOne({ planId: plan.id })).toMatchObject({ status: 'active', noShow: false })
  })

  it('pedir el estado que ya tiene no cambia nada (200)', async () => {
    const { ana, path } = await scenario()

    const res = await ana.api.patch(path, { status: 'open' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('open')
  })

  it('409 PLAN_CLOSED al cerrar o reabrir un plan que ya empezó', async () => {
    const { travelTo, ana, path } = await scenario()
    await travelTo(STARTS_AT, ana)

    expectError(await ana.api.patch(path, { status: 'closed' }), expect, 409, 'PLAN_CLOSED')
  })

  it('se puede cancelar después de empezar, hasta que termina; las inscripciones quedan como estaban', async () => {
    const { travelTo, ana, beto, plan, path } = await scenario()
    await beto.api.post(`${path}/join`)
    await travelTo(new Date(ENDS_AT.getTime() - MINUTE_MS), ana, beto)

    const res = await ana.api.patch(path, { status: 'cancelled' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
    expect(await Participation.findOne({ planId: plan.id })).toMatchObject({ status: 'active', noShow: false })
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
  })

  it('409 PLAN_CLOSED al cancelar un plan que ya terminó', async () => {
    const { travelTo, ana, path } = await scenario()
    await travelTo(ENDS_AT, ana)

    expectError(await ana.api.patch(path, { status: 'cancelled' }), expect, 409, 'PLAN_CLOSED')
  })

  it('cancelled es final: no se reabre, no se edita y no admite inscripciones', async () => {
    const { ana, beto, path } = await scenario()
    await ana.api.patch(path, { status: 'cancelled' })

    expectError(await ana.api.patch(path, { status: 'open' }), expect, 409, 'PLAN_CLOSED')
    expectError(await ana.api.patch(path, { title: 'Otro título' }), expect, 409, 'PLAN_CLOSED')
    // Un plan cancelado solo lo ven su creador y sus inscriptos.
    expectError(await beto.api.post(`${path}/join`), expect, 404, 'NOT_FOUND')
  })

  it('403 si no es el creador', async () => {
    const { beto, plan, path } = await scenario()

    expectError(await beto.api.patch(path, { status: 'cancelled' }), expect, 403, 'FORBIDDEN')
    expect((await Plan.findById(plan.id)).status).toBe('open')
  })

  it('cancelar un plan con noShow ya marcados los conserva', async () => {
    const { travelTo, attendanceService, ana, beto, plan, path } = await scenario()
    await beto.api.post(`${path}/join`)
    await travelTo(new Date(STARTS_AT.getTime() + 61 * MINUTE_MS), ana, beto)
    await attendanceService.closeDueAttendance()

    await ana.api.patch(path, { status: 'cancelled' })

    expect(await Participation.findOne({ planId: plan.id })).toMatchObject({ noShow: true })
  })
})

describe('radio y ventana de check-in del plan', () => {
  it('el creador elige el radio al crear y lo puede cambiar; por defecto son 150 m', async () => {
    const { ana, plan, path } = await scenario()
    const { body: custom } = await ana.api.post('/plans', planBody({ checkInRadiusMeters: 400 }))

    const patched = await ana.api.patch(path, { checkInRadiusMeters: 60 })

    expect(plan.checkInRadiusMeters).toBe(150)
    expect(custom.checkInRadiusMeters).toBe(400)
    expect(patched.body.checkInRadiusMeters).toBe(60)
  })

  it('al cambiar las fechas la ventana se recalcula sola', async () => {
    const { ana, path } = await scenario()

    const res = await ana.api.patch(path, { startsAt: hoursFromNow(72).toISOString(), endsAt: hoursFromNow(74).toISOString() })

    expect(res.body).toMatchObject({
      checkInOpensAt: new Date(hoursFromNow(72).getTime() - 15 * MINUTE_MS).toISOString(),
      checkInClosesAt: hoursFromNow(73).toISOString()
    })
  })

  it('la ventana nunca pasa de endsAt: un plan de 30 minutos cierra cuando termina', async () => {
    const endsAt = new Date(STARTS_AT.getTime() + 30 * MINUTE_MS).toISOString()

    const { plan } = await scenario({ endsAt })

    expect(plan.checkInClosesAt).toBe(endsAt)
  })

  it.each([
    ['radio menor a 50 m', { checkInRadiusMeters: 49 }],
    ['radio mayor a 1000 m', { checkInRadiusMeters: 1001 }],
    ['checkInOpensAt (la calcula el back)', { checkInOpensAt: STARTS_AT.toISOString() }],
    ['checkInClosesAt (la calcula el back)', { checkInClosesAt: ENDS_AT.toISOString() }],
    ['attendanceClosedAt (solo-backend)', { attendanceClosedAt: ENDS_AT.toISOString() }]
  ])('400 al crear un plan con %s', async (_label, override) => {
    const { ana } = await scenario()

    expectValidationError(await ana.api.post('/plans', planBody(override)), expect)
  })
})

describe('GET /users/me/plans', () => {
  const ids = (res) => res.body.items.map((item) => item.id)

  it('role=created: los planes que creó, del más próximo al más lejano, en cualquier estado', async () => {
    const { ana, beto, plan } = await scenario()
    const { body: later } = await ana.api.post('/plans', planBody({ title: 'Más adelante', startsAt: hoursFromNow(96).toISOString(), endsAt: hoursFromNow(98).toISOString() }))
    await ana.api.patch(`/plans/${later.id}`, { status: 'cancelled' })
    await beto.api.post('/plans', planBody({ title: 'De Beto' }))

    const res = await ana.api.get('/users/me/plans?role=created')

    expect(res.status).toBe(200)
    expect(ids(res)).toEqual([plan.id, later.id])
    expect(res.body.items[1]).toMatchObject({ status: 'cancelled', isCreator: true, myParticipation: null })
    expect(res.body.nextCursor).toBeNull()
  })

  it('role=joined: solo los planes con inscripción activa, con el estado propio', async () => {
    const { ana, beto, plan } = await scenario()
    const { body: left } = await ana.api.post('/plans', planBody({ title: 'Me bajé' }))
    await beto.api.post(`/plans/${plan.id}/join`)
    await beto.api.post(`/plans/${left.id}/join`)
    await beto.api.delete(`/plans/${left.id}/join`)

    const res = await beto.api.get('/users/me/plans?role=joined')

    expect(ids(res)).toEqual([plan.id])
    expect(res.body.items[0]).toMatchObject({
      isCreator: false,
      creator: { id: ana.id, name: 'Ana', reputation: 0 },
      myParticipation: { status: 'active', checkedInAt: null, noShow: false }
    })
  })

  it('when=past: los que ya terminaron, del más reciente al más viejo, con check-in o noShow', async () => {
    const { travelTo, attendanceService, ana, beto, signUp, plan } = await scenario()
    const caro = await signUp({ name: 'Caro' })
    await beto.api.post(`/plans/${plan.id}/join`)
    await caro.api.post(`/plans/${plan.id}/join`)
    await travelTo(STARTS_AT, ana, beto, caro)
    const { body: qr } = await ana.api.post(`/plans/${plan.id}/qr`)
    await beto.api.post(`/plans/${plan.id}/check-in`, checkInBody({ qrToken: qr.qrToken }))
    await travelTo(new Date(ENDS_AT.getTime() + MINUTE_MS), ana, beto, caro)
    await attendanceService.completeDuePlans()

    const attended = await beto.api.get('/users/me/plans?role=joined&when=past')
    const missed = await caro.api.get('/users/me/plans?role=joined&when=past')
    const upcoming = await beto.api.get('/users/me/plans?role=joined')

    expect(attended.body.items[0]).toMatchObject({ id: plan.id, status: 'completed', myParticipation: { checkedInAt: STARTS_AT.toISOString(), noShow: false } })
    expect(missed.body.items[0]).toMatchObject({ id: plan.id, myParticipation: { checkedInAt: null, noShow: true } })
    expect(upcoming.body.items).toEqual([])
  })

  it('pagina con limit y cursor, sin repetir ni saltear', async () => {
    const { ana, plan } = await scenario()
    const created = [plan.id]
    for (const hours of [60, 72]) {
      const { body } = await ana.api.post('/plans', planBody({ startsAt: hoursFromNow(hours).toISOString(), endsAt: hoursFromNow(hours + 2).toISOString() }))
      created.push(body.id)
    }

    const first = await ana.api.get('/users/me/plans?role=created&limit=2')
    const second = await ana.api.get(`/users/me/plans?role=created&limit=2&cursor=${first.body.nextCursor}`)

    expect([...ids(first), ...ids(second)]).toEqual(created)
    expect(second.body.nextCursor).toBeNull()
  })

  it('nunca muestra planes ajenos en los que no participa', async () => {
    const { beto } = await scenario()

    expect((await beto.api.get('/users/me/plans?role=created')).body.items).toEqual([])
    expect((await beto.api.get('/users/me/plans?role=joined')).body.items).toEqual([])
  })

  it.each([
    ['sin role', ''],
    ['role desconocido', '?role=all'],
    ['when desconocido', '?role=created&when=now'],
    ['un filtro que no existe', '?role=created&userId=0123456789abcdef01234567'],
    ['limit mayor a 100', '?role=created&limit=101']
  ])('400 VALIDATION_ERROR: %s', async (_label, query) => {
    const { ana } = await scenario()

    expectValidationError(await ana.api.get(`/users/me/plans${query}`), expect)
  })

  it('401 sin token', async () => {
    const { anonymous } = await scenario()

    expectError(await anonymous.get('/users/me/plans?role=created'), expect, 401, 'UNAUTHENTICATED')
  })
})

describe('noShowCount en GET /users/me', () => {
  it('cuenta las ausencias propias y no aparece en la vista de otros', async () => {
    const { travelTo, attendanceService, ana, beto, plan } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await ana.api.post(`/plans/${plan.id}/join`)
    await travelTo(new Date(STARTS_AT.getTime() + 61 * MINUTE_MS), ana, beto)
    await attendanceService.closeDueAttendance()

    const me = await beto.api.get('/users/me')
    const participants = await ana.api.get(`/plans/${plan.id}/participants`)

    expect(me.body).toMatchObject({ noShowCount: 1, reputation: 0 })
    expect(JSON.stringify(participants.body)).not.toMatch(/noShow/)
  })
})
