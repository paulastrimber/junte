// Ganchos de las inscripciones hacia los avisos (S5-BE-08/10): siempre después del commit, nunca si la transacción falla.
import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createParticipationService } from './participation.service.js'

const PLAN_ID = '885f1c2a9b1e8a001234567a'
const CREATOR_ID = '665f1c2a9b1e8a0012345678'
const USER_ID = '775f1c2a9b1e8a0012345679'
const NOW = new Date('2026-11-04T15:00:00Z')

const plan = (overrides = {}) => ({ id: PLAN_ID, creatorId: CREATOR_ID, status: 'open', startsAt: new Date('2026-11-05T15:00:00Z'), capacity: 2, participantCount: 1, ...overrides })

function setup ({ commitFails = false, afterLeave = plan() } = {}) {
  const events = []
  const withTransaction = vi.fn(async (work) => {
    const result = await work({ id: 'session' })
    if (commitFails) throw new Error('TransientTransactionError: commit failed')
    events.push('commit')
    return result
  })
  const notifier = {
    planJoined: vi.fn(async () => { events.push('planJoined') }),
    spotFreed: vi.fn(async () => { events.push('spotFreed') })
  }
  const spotAlerts = { remove: vi.fn(async () => { events.push('spotAlerts.remove'); return true }) }
  const service = createParticipationService({
    plans: { requireVisible: vi.fn(async () => plan()) },
    planRepo: { incrementIfCapacity: vi.fn(async () => plan({ participantCount: 2 })), decrementCount: vi.fn(async () => afterLeave), findById: vi.fn(async () => plan()) },
    participationRepo: {
      activate: vi.fn(async () => ({ planId: PLAN_ID, userId: USER_ID, status: 'active', joinedAt: NOW })),
      cancel: vi.fn(async () => true)
    },
    checkInRepo: { exists: vi.fn(async () => false) },
    userRepo: {},
    withTransaction,
    clock: createFixedClock(NOW),
    logger: { info: vi.fn(), warn: vi.fn() },
    spotAlerts,
    notifier
  })
  return { service, notifier, spotAlerts, events }
}

describe('participationService.join', () => {
  it('avisa al creador y borra el pedido de aviso después del commit', async () => {
    const { service, notifier, events } = setup()

    await service.join({ planId: PLAN_ID, userId: USER_ID })

    expect(notifier.planJoined).toHaveBeenCalledWith({ planId: PLAN_ID, userId: USER_ID })
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('planJoined'))
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('spotAlerts.remove'))
  })

  it('si la transacción falla no avisa a nadie ni borra el pedido', async () => {
    const { service, notifier, spotAlerts } = setup({ commitFails: true })

    await expect(service.join({ planId: PLAN_ID, userId: USER_ID })).rejects.toThrow(/commit failed/)
    expect(notifier.planJoined).not.toHaveBeenCalled()
    expect(spotAlerts.remove).not.toHaveBeenCalled()
  })

  it('no espera al aviso: una promesa de push colgada no bloquea la inscripción', async () => {
    const { service, notifier } = setup()
    notifier.planJoined.mockReturnValue(new Promise(() => {}))

    await expect(service.join({ planId: PLAN_ID, userId: USER_ID })).resolves.toMatchObject({ status: 'active' })
  })
})

describe('participationService.leave', () => {
  it('en un plan que estaba lleno avisa el cupo liberado después del commit', async () => {
    const { service, notifier, events } = setup({ afterLeave: plan({ capacity: 2, participantCount: 1 }) })

    await service.leave({ planId: PLAN_ID, userId: USER_ID })

    expect(notifier.spotFreed).toHaveBeenCalledWith({ planId: PLAN_ID })
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('spotFreed'))
  })

  it('no avisa si el plan no estaba lleno, si tiene cupo ilimitado o si tiene las inscripciones cerradas', async () => {
    for (const afterLeave of [plan({ capacity: 3, participantCount: 1 }), plan({ capacity: null, participantCount: 7 }), plan({ status: 'closed' })]) {
      const { service, notifier } = setup({ afterLeave })
      await service.leave({ planId: PLAN_ID, userId: USER_ID })
      expect(notifier.spotFreed).not.toHaveBeenCalled()
    }
  })

  it('si la transacción falla no avisa', async () => {
    const { service, notifier } = setup({ commitFails: true })

    await expect(service.leave({ planId: PLAN_ID, userId: USER_ID })).rejects.toThrow(/commit failed/)
    expect(notifier.spotFreed).not.toHaveBeenCalled()
  })
})
