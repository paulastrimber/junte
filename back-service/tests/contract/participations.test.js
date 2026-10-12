// Contrato de las inscripciones (S4-BE-01 a 03) y de la lista de anotados.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { checkInBody, expectError, expectValidationError, hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'
import { Participation } from '../../src/modules/participations/participation.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { User } from '../../src/modules/users/user.model.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'

/** Ana crea un plan (48 h en el futuro) y Beto es otro usuario. */
async function scenario (overrides = {}) {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const { body: plan } = await ana.api.post('/plans', planBody(overrides))
  return { ...api, ana, beto, plan, joinPath: `/plans/${plan.id}/join` }
}

describe('POST /plans/:id/join', () => {
  it('201 con la inscripción; el contador sube y el detalle muestra la inscripción propia', async () => {
    const { beto, plan, joinPath } = await scenario()

    const res = await beto.api.post(joinPath)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ planId: plan.id, status: 'active', joinedAt: expect.any(String) })
    const { body: detail } = await beto.api.get(`/plans/${plan.id}`)
    expect(detail).toMatchObject({
      participantCount: 1,
      availableSpots: 9,
      myParticipation: { status: 'active', joinedAt: res.body.joinedAt, checkedInAt: null, noShow: false }
    })
  })

  it('el creador no ocupa cupo al crear: se inscribe como cualquiera', async () => {
    const { ana, plan, joinPath } = await scenario()

    expect((await ana.api.get(`/plans/${plan.id}`)).body.myParticipation).toBeNull()
    expect((await ana.api.post(joinPath)).status).toBe(201)
    expect((await ana.api.get(`/plans/${plan.id}`)).body).toMatchObject({ participantCount: 1, isCreator: true })
  })

  it('la identidad sale del token: un body con userId es 400 y no inscribe a nadie', async () => {
    const { ana, beto, joinPath } = await scenario()

    const res = await beto.api.post(joinPath, { userId: ana.id })

    expectValidationError(res, expect)
    expect(await Participation.countDocuments()).toBe(0)
  })

  it('401 sin token; 404 si el plan no existe; 400 si el id no es válido', async () => {
    const { anonymous, beto, joinPath } = await scenario()

    expectError(await anonymous.post(joinPath), expect, 401, 'UNAUTHENTICATED')
    expectError(await beto.api.post(`/plans/${UNKNOWN_ID}/join`), expect, 404, 'NOT_FOUND')
    expectValidationError(await beto.api.post('/plans/no-es-un-id/join'), expect)
  })

  it('409 PLAN_FULL cuando no queda lugar, y el contador no se pasa del cupo', async () => {
    const { ana, beto, plan, joinPath } = await scenario({ capacity: 1 })
    await ana.api.post(joinPath)

    const res = await beto.api.post(joinPath)

    expectError(res, expect, 409, 'PLAN_FULL')
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
    expect(await Participation.countDocuments({ planId: plan.id })).toBe(1)
  })

  it('un plan de cupo ilimitado nunca responde PLAN_FULL', async () => {
    const { ana, beto, plan, joinPath } = await scenario({ capacity: null })

    expect((await ana.api.post(joinPath)).status).toBe(201)
    expect((await beto.api.post(joinPath)).status).toBe(201)
    expect((await beto.api.get(`/plans/${plan.id}`)).body).toMatchObject({ participantCount: 2, availableSpots: null, isFull: false })
  })

  it('409 ALREADY_JOINED al inscribirse dos veces: una sola inscripción y el contador en 1', async () => {
    const { beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)

    const res = await beto.api.post(joinPath)

    expectError(res, expect, 409, 'ALREADY_JOINED')
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
    expect(await Participation.countDocuments({ planId: plan.id })).toBe(1)
  })

  it('409 PLAN_CLOSED si el creador cerró las inscripciones, y vuelve a aceptar cuando las reabre', async () => {
    const { ana, beto, plan, joinPath } = await scenario()
    await ana.api.patch(`/plans/${plan.id}`, { status: 'closed' })

    expectError(await beto.api.post(joinPath), expect, 409, 'PLAN_CLOSED')

    await ana.api.patch(`/plans/${plan.id}`, { status: 'open' })
    expect((await beto.api.post(joinPath)).status).toBe(201)
  })

  it('409 PLAN_CLOSED si el plan ya empezó', async () => {
    const { travelTo, beto, joinPath } = await scenario()
    await travelTo(hoursFromNow(48), beto)

    expectError(await beto.api.post(joinPath), expect, 409, 'PLAN_CLOSED')
  })
})

describe('DELETE /plans/:id/join', () => {
  it('204: el contador baja y el registro queda cancelado (no se borra)', async () => {
    const { beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)

    const res = await beto.api.delete(joinPath)

    expect(res.status).toBe(204)
    expect(res.body).toEqual({})
    expect((await Plan.findById(plan.id)).participantCount).toBe(0)
    const [record] = await Participation.find({ planId: plan.id })
    expect(record).toMatchObject({ status: 'cancelled', cancelledAt: expect.any(Date) })
    expect((await beto.api.get(`/plans/${plan.id}`)).body.myParticipation).toMatchObject({ status: 'cancelled' })
  })

  it('es idempotente: 204 si no estaba inscripto o ya se había dado de baja, sin tocar el contador', async () => {
    const { ana, beto, plan, joinPath } = await scenario()
    await ana.api.post(joinPath)

    expect((await beto.api.delete(joinPath)).status).toBe(204)
    await beto.api.post(joinPath)
    await beto.api.delete(joinPath)
    expect((await beto.api.delete(joinPath)).status).toBe(204)

    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
  })

  it('se puede dar de baja con las inscripciones cerradas, mientras el plan no haya empezado', async () => {
    const { ana, beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await ana.api.patch(`/plans/${plan.id}`, { status: 'closed' })

    expect((await beto.api.delete(joinPath)).status).toBe(204)
    expect((await Plan.findById(plan.id)).participantCount).toBe(0)
  })

  it('409 PLAN_CLOSED si el plan ya empezó: la inscripción sigue activa', async () => {
    const { travelTo, beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await travelTo(hoursFromNow(48), beto)

    expectError(await beto.api.delete(joinPath), expect, 409, 'PLAN_CLOSED')
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
    expect(await Participation.countDocuments({ planId: plan.id, status: 'active' })).toBe(1)
  })

  it('409 PLAN_CLOSED si el plan fue cancelado', async () => {
    const { ana, beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await ana.api.patch(`/plans/${plan.id}`, { status: 'cancelled' })

    expectError(await beto.api.delete(joinPath), expect, 409, 'PLAN_CLOSED')
  })

  it('409 PLAN_CLOSED si ya registró su asistencia (la ventana abre antes de que empiece el plan)', async () => {
    const { travelTo, ana, beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await travelTo(new Date(hoursFromNow(48).getTime() - 10 * 60 * 1000), ana, beto)
    const { body: qr } = await ana.api.post(`/plans/${plan.id}/qr`)
    await beto.api.post(`/plans/${plan.id}/check-in`, checkInBody({ qrToken: qr.qrToken }))

    expectError(await beto.api.delete(joinPath), expect, 409, 'PLAN_CLOSED')
    expect(await Participation.countDocuments({ planId: plan.id, status: 'active' })).toBe(1)
    expect((await User.findById(beto.id)).reputation).toBe(1)
  })

  it('401 sin token; 404 si el plan no existe', async () => {
    const { anonymous, beto, joinPath } = await scenario()

    expectError(await anonymous.delete(joinPath), expect, 401, 'UNAUTHENTICATED')
    expectError(await beto.api.delete(`/plans/${UNKNOWN_ID}/join`), expect, 404, 'NOT_FOUND')
  })
})

describe('reactivación de una inscripción cancelada', () => {
  it('volver a inscribirse reutiliza el mismo registro y lo deja activo', async () => {
    const { beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await beto.api.delete(joinPath)

    const res = await beto.api.post(joinPath)

    expect(res.status).toBe(201)
    const records = await Participation.find({ planId: plan.id }).lean()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'active', noShow: false })
    expect(records[0]).not.toHaveProperty('cancelledAt')
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
  })

  it('con las mismas reglas que la primera vez: sin lugar es PLAN_FULL', async () => {
    const { ana, beto, joinPath } = await scenario({ capacity: 1 })
    await beto.api.post(joinPath)
    await beto.api.delete(joinPath)
    await ana.api.post(joinPath)

    expectError(await beto.api.post(joinPath), expect, 409, 'PLAN_FULL')
  })
})

describe('GET /plans/:id/participants', () => {
  it('200 paginado con id, nombre, foto y reputación de los anotados activos, por orden de inscripción', async () => {
    const { signUp, clock, ana, beto, plan, joinPath } = await scenario()
    const caro = await signUp({ name: 'Caro' })
    await beto.api.post(joinPath)
    clock.advance(1000)
    await caro.api.post(joinPath)
    clock.advance(1000)
    await ana.api.post(joinPath)
    await ana.api.delete(joinPath)
    await User.updateOne({ _id: caro.id }, { $set: { reputation: 4 } })

    const res = await beto.api.get(`/plans/${plan.id}/participants`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      items: [
        { id: beto.id, name: 'Beto', photoUrl: null, reputation: 0 },
        { id: caro.id, name: 'Caro', photoUrl: null, reputation: 4 }
      ],
      nextCursor: null
    })
  })

  it('pagina con limit y cursor, sin repetir ni saltear', async () => {
    const { signUp, clock, beto, plan, joinPath } = await scenario()
    const caro = await signUp({ name: 'Caro' })
    const dani = await signUp({ name: 'Dani' })
    for (const user of [beto, caro, dani]) {
      await user.api.post(joinPath)
      clock.advance(1000)
    }

    const first = await beto.api.get(`/plans/${plan.id}/participants?limit=2`)
    const second = await beto.api.get(`/plans/${plan.id}/participants?limit=2&cursor=${first.body.nextCursor}`)

    expect(first.body.items.map((item) => item.name)).toEqual(['Beto', 'Caro'])
    expect(second.body).toEqual({ items: [expect.objectContaining({ name: 'Dani' })], nextCursor: null })
  })

  it('el creador la ve aunque no esté inscripto; quien no participa recibe 403', async () => {
    const { signUp, ana, beto, plan, joinPath } = await scenario()
    const caro = await signUp({ name: 'Caro' })
    await beto.api.post(joinPath)

    expect((await ana.api.get(`/plans/${plan.id}/participants`)).status).toBe(200)
    expectError(await caro.api.get(`/plans/${plan.id}/participants`), expect, 403, 'FORBIDDEN')
  })

  it('quien se dio de baja deja de verla', async () => {
    const { beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await beto.api.delete(joinPath)

    expectError(await beto.api.get(`/plans/${plan.id}/participants`), expect, 403, 'FORBIDDEN')
  })

  it('nunca expone ausencias ni datos privados de los anotados', async () => {
    const { ana, beto, plan, joinPath } = await scenario()
    await beto.api.post(joinPath)
    await Participation.updateOne({ planId: plan.id, userId: beto.id }, { $set: { noShow: true, noShowAt: new Date() } })

    const res = await ana.api.get(`/plans/${plan.id}/participants`)

    expect(JSON.stringify(res.body)).not.toMatch(/noShow|email|birthDate|passwordHash|neighborhood/)
  })

  it('401 sin token; 404 si el plan no existe; 400 con un limit inválido', async () => {
    const { anonymous, ana, plan } = await scenario()

    expectError(await anonymous.get(`/plans/${plan.id}/participants`), expect, 401, 'UNAUTHENTICATED')
    expectError(await ana.api.get(`/plans/${UNKNOWN_ID}/participants`), expect, 404, 'NOT_FOUND')
    expectValidationError(await ana.api.get(`/plans/${plan.id}/participants?limit=101`), expect)
  })
})
