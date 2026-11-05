// Contrato de "avisame si se libera un lugar" (S5-BE-10): PUT y DELETE /plans/:id/spot-alert y `spotAlertRequested`.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'
import { SpotAlert } from '../../src/modules/spot-alerts/index.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'

/** Ana crea un plan de 1 lugar, Beto lo ocupa y Caro quiere que le avisen. */
async function scenario (overrides = {}) {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody({ capacity: 1, ...overrides }))
  if (plan.capacity !== null) await beto.api.post(`/plans/${plan.id}/join`)
  return { ...api, ana, beto, caro, plan, alertPath: `/plans/${plan.id}/spot-alert` }
}

describe('PUT /plans/:id/spot-alert', () => {
  it('204 en un plan lleno; el detalle muestra spotAlertRequested', async () => {
    const { caro, plan, alertPath } = await scenario()

    expect((await caro.api.get(`/plans/${plan.id}`)).body.spotAlertRequested).toBe(false)
    const res = await caro.api.put(alertPath)

    expect(res.status).toBe(204)
    expect((await caro.api.get(`/plans/${plan.id}`)).body).toMatchObject({ isFull: true, spotAlertRequested: true })
  })

  it('dos pedidos del mismo usuario dejan uno solo', async () => {
    const { caro, alertPath } = await scenario()

    expect((await caro.api.put(alertPath)).status).toBe(204)
    expect((await caro.api.put(alertPath)).status).toBe(204)
    expect(await SpotAlert.countDocuments()).toBe(1)
  })

  it('pedir aviso en un plan con lugar es 409 PLAN_NOT_FULL', async () => {
    const { caro, alertPath } = await scenario({ capacity: 2 })

    expectError(await caro.api.put(alertPath), expect, 409, 'PLAN_NOT_FULL')
    expect(await SpotAlert.countDocuments()).toBe(0)
  })

  it('un plan de cupo ilimitado nunca admite pedidos', async () => {
    const { caro, alertPath } = await scenario({ capacity: null })

    expectError(await caro.api.put(alertPath), expect, 409, 'PLAN_NOT_FULL')
  })

  it('quien ya está inscripto recibe 409 ALREADY_JOINED; con inscripciones cerradas, 409 PLAN_CLOSED', async () => {
    const { ana, beto, caro, plan, alertPath } = await scenario()

    expectError(await beto.api.put(alertPath), expect, 409, 'ALREADY_JOINED')
    await ana.api.patch(`/plans/${plan.id}`, { status: 'closed' })
    expectError(await caro.api.put(alertPath), expect, 409, 'PLAN_CLOSED')
  })

  it('la identidad sale del token: un body con userId es 400; 401 sin token; 404 si el plan no existe', async () => {
    const { anonymous, beto, caro, alertPath } = await scenario()

    expectValidationError(await caro.api.put(alertPath, { userId: beto.id }), expect)
    expectError(await anonymous.put(alertPath), expect, 401, 'UNAUTHENTICATED')
    expectError(await caro.api.put(`/plans/${UNKNOWN_ID}/spot-alert`), expect, 404, 'NOT_FOUND')
    expect(await SpotAlert.countDocuments()).toBe(0)
  })
})

describe('DELETE /plans/:id/spot-alert', () => {
  it('204 y el detalle deja de mostrarlo; idempotente', async () => {
    const { caro, plan, alertPath } = await scenario()
    await caro.api.put(alertPath)

    expect((await caro.api.delete(alertPath)).status).toBe(204)
    expect((await caro.api.delete(alertPath)).status).toBe(204)
    expect((await caro.api.get(`/plans/${plan.id}`)).body.spotAlertRequested).toBe(false)
  })
})

describe('ciclo de vida del pedido', () => {
  it('al inscribirse se borra el pedido de ese usuario; el de los demás se conserva', async () => {
    const { ana, beto, caro, plan, alertPath } = await scenario()
    await caro.api.put(alertPath)
    await ana.api.put(alertPath)

    await beto.api.delete(`/plans/${plan.id}/join`)
    expect((await caro.api.post(`/plans/${plan.id}/join`)).status).toBe(201)

    await expect.poll(() => SpotAlert.countDocuments({ userId: caro.id })).toBe(0)
    expect(await SpotAlert.countDocuments({ userId: ana.id })).toBe(1)
  })

  it('el job borra los pedidos cuando el plan empieza', async () => {
    const { caro, plan, alertPath, spotAlertService, travelTo } = await scenario()
    await caro.api.put(alertPath)

    expect(await spotAlertService.purgeExpired()).toBe(0)
    await travelTo(new Date(new Date(plan.startsAt).getTime() + 1000))
    expect(await spotAlertService.purgeExpired()).toBe(1)
    expect(await SpotAlert.countDocuments()).toBe(0)
  })

  it('se conserva después de un aviso mientras el plan no empiece', async () => {
    const { beto, caro, plan, alertPath, travelTo } = await scenario()
    await caro.api.put(alertPath)
    await beto.api.delete(`/plans/${plan.id}/join`)

    await travelTo(hoursFromNow(47))
    expect(await SpotAlert.countDocuments({ userId: caro.id })).toBe(1)
  })
})
