// Avisos push (S5-BE-07/08) de punta a punta contra MongoDB: nuevo inscripto, cupo liberado y recordatorio.
// El push es el de memoria (`push.sent`); `push.invalidTokens` simula los tokens que FCM rechaza.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'
import { DeviceToken } from '../../src/modules/devices/index.js'
import { Plan } from '../../src/modules/plans/plan.model.js'

useTestDb()

const MINUTE_MS = 60 * 1000

/** Ana organiza (plan de 2 lugares, empieza en 48 h); cada uno registra su teléfono. */
async function scenario (overrides = {}) {
  const api = setupApi()
  const [ana, beto, caro, dani] = await Promise.all(['Ana', 'Beto', 'Caro', 'Dani'].map((name) => api.signUp({ name })))
  for (const person of [ana, beto, caro, dani]) {
    await person.api.post('/devices', { token: `token-${person.id}`, platform: 'android' })
  }
  const { body: plan } = await ana.api.post('/plans', planBody({ capacity: 2, ...overrides }))
  const sentOf = (type) => api.push.sent.filter((message) => message.data.type === type)
  return { ...api, ana, beto, caro, dani, plan, sentOf }
}

describe('nuevo inscripto', () => {
  it('avisa al creador con el plan en `data`; no a quien se inscribe', async () => {
    const { beto, ana, plan, sentOf } = await scenario()

    await beto.api.post(`/plans/${plan.id}/join`)

    await expect.poll(() => sentOf('plan.joined').length).toBe(1)
    expect(sentOf('plan.joined')[0]).toMatchObject({
      tokens: [`token-${ana.id}`],
      notification: { title: expect.any(String), body: expect.stringContaining('Beto') },
      data: { type: 'plan.joined', planId: plan.id }
    })
  })

  it('el creador que se inscribe a su propio plan no recibe aviso', async () => {
    const { ana, plan, push } = await scenario()

    await ana.api.post(`/plans/${plan.id}/join`)
    // Una vuelta más para dar tiempo al envío (que no tiene que ocurrir).
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(push.sent).toHaveLength(0)
  })
})

describe('cupo liberado', () => {
  it('avisa a TODOS los que pidieron aviso (no a los inscriptos) y los pedidos se conservan', async () => {
    const { beto, caro, dani, ana, plan, sentOf } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await ana.api.post(`/plans/${plan.id}/join`)
    await caro.api.put(`/plans/${plan.id}/spot-alert`)
    await dani.api.put(`/plans/${plan.id}/spot-alert`)

    await beto.api.delete(`/plans/${plan.id}/join`)

    await expect.poll(() => sentOf('plan.spot_freed').length).toBe(1)
    expect(sentOf('plan.spot_freed')[0].tokens.sort()).toEqual([`token-${caro.id}`, `token-${dani.id}`].sort())
    expect((await caro.api.get(`/plans/${plan.id}`)).body.spotAlertRequested).toBe(true)
  })

  it('no avisa si el plan no estaba lleno', async () => {
    const { beto, plan, push } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await expect.poll(() => push.sent.length).toBe(1)

    await beto.api.delete(`/plans/${plan.id}/join`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(push.sent.map((message) => message.data.type)).toEqual(['plan.joined'])
  })
})

describe('mensaje nuevo de chat', () => {
  it('avisa a todos los del chat (participantes + creador) menos al que escribió', async () => {
    const { ana, beto, caro, plan, sentOf } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await caro.api.post(`/plans/${plan.id}/join`)

    await beto.api.post(`/plans/${plan.id}/messages`, { text: 'Hola a todos' })

    await expect.poll(() => sentOf('chat.message').length).toBe(1)
    const message = sentOf('chat.message')[0]
    expect(message.tokens.sort()).toEqual([`token-${ana.id}`, `token-${caro.id}`].sort())
    expect(message).toMatchObject({
      notification: { title: expect.any(String), body: expect.stringContaining('Beto') },
      data: { type: 'chat.message', planId: plan.id }
    })
    // El aviso nunca lleva el texto del mensaje (regla 13).
    expect(JSON.stringify(message.notification)).not.toContain('Hola a todos')
  })

  it('un reintento con el mismo clientId no avisa de nuevo', async () => {
    const { beto, plan, sentOf } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)

    await beto.api.post(`/plans/${plan.id}/messages`, { text: 'Hola', clientId: 'c-1' })
    await beto.api.post(`/plans/${plan.id}/messages`, { text: 'Hola', clientId: 'c-1' })

    await expect.poll(() => sentOf('chat.message').length).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sentOf('chat.message')).toHaveLength(1)
  })

  it('si solo está el creador en el chat, su mensaje no avisa a nadie', async () => {
    const { ana, plan, sentOf } = await scenario()

    await ana.api.post(`/plans/${plan.id}/messages`, { text: 'Primer mensaje' })
    // Una vuelta más para dar tiempo al envío (que no tiene que ocurrir).
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sentOf('chat.message')).toHaveLength(0)
  })
})

describe('tokens inválidos', () => {
  it('los que FCM rechaza se borran; los demás quedan', async () => {
    const { beto, ana, plan, push } = await scenario()
    await ana.api.post('/devices', { token: 'token-ana-viejo', platform: 'android' })
    push.invalidTokens.add('token-ana-viejo')

    await beto.api.post(`/plans/${plan.id}/join`)

    await expect.poll(() => DeviceToken.countDocuments({ token: 'token-ana-viejo' })).toBe(0)
    expect(await DeviceToken.countDocuments({ token: `token-${ana.id}` })).toBe(1)
  })
})

describe('recordatorio (job)', () => {
  it('avisa a los inscriptos una sola vez aunque el job corra varias veces', async () => {
    const { ana, beto, caro, plan, notifier, sentOf, travelTo } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await caro.api.post(`/plans/${plan.id}/join`)

    expect(await notifier.sendDueReminders()).toBe(0)
    await travelTo(new Date(hoursFromNow(48).getTime() - 30 * MINUTE_MS), ana)
    expect(await notifier.sendDueReminders()).toBe(1)
    expect(await notifier.sendDueReminders()).toBe(0)

    expect(sentOf('plan.reminder')).toHaveLength(1)
    expect(sentOf('plan.reminder')[0].tokens.sort()).toEqual([`token-${beto.id}`, `token-${caro.id}`].sort())
    expect((await Plan.findById(plan.id)).reminderSentAt).toBeInstanceOf(Date)
  })

  it('dos ejecuciones simultáneas (dos instancias) no lo duplican', async () => {
    const { beto, plan, notifier, sentOf, travelTo } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await travelTo(new Date(hoursFromNow(48).getTime() - 10 * MINUTE_MS))

    const results = await Promise.all([notifier.sendDueReminders(), notifier.sendDueReminders()])

    expect(results.sort()).toEqual([0, 1])
    expect(sentOf('plan.reminder')).toHaveLength(1)
  })

  it('no recuerda planes cancelados; si cambia el horario se vuelve a recordar', async () => {
    const { ana, beto, plan, notifier, sentOf, travelTo } = await scenario()
    await beto.api.post(`/plans/${plan.id}/join`)
    await travelTo(new Date(hoursFromNow(48).getTime() - 30 * MINUTE_MS), ana)
    await notifier.sendDueReminders()

    const later = { startsAt: hoursFromNow(60).toISOString(), endsAt: hoursFromNow(62).toISOString() }
    expect((await ana.api.patch(`/plans/${plan.id}`, later)).status).toBe(200)
    expect((await Plan.findById(plan.id)).reminderSentAt).toBeUndefined()

    await travelTo(new Date(hoursFromNow(60).getTime() - 30 * MINUTE_MS), ana)
    expect(await notifier.sendDueReminders()).toBe(1)
    expect(sentOf('plan.reminder')).toHaveLength(2)

    const { body: other } = await ana.api.post('/plans', planBody({ startsAt: hoursFromNow(61).toISOString(), endsAt: hoursFromNow(62).toISOString() }))
    await ana.api.patch(`/plans/${other.id}`, { status: 'cancelled' })
    await travelTo(new Date(hoursFromNow(61).getTime() - 30 * MINUTE_MS))
    expect(await notifier.sendDueReminders()).toBe(0)
  })
})
