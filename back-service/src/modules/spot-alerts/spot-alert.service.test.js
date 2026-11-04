import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { AppError } from '../../shared/errors.js'
import { isFull } from '../plans/index.js'
import { createSpotAlertService } from './spot-alert.service.js'

const PLAN_ID = '885f1c2a9b1e8a001234567a'
const CREATOR_ID = '665f1c2a9b1e8a0012345678'
const USER_ID = '775f1c2a9b1e8a0012345679'
const NOW = new Date('2026-11-04T15:00:00Z')
const LATER = new Date('2026-11-05T15:00:00Z')

const fullPlan = (overrides = {}) => ({
  id: PLAN_ID, creatorId: CREATOR_ID, status: 'open', startsAt: LATER, capacity: 2, participantCount: 2, ...overrides
})

function setup ({ plan = fullPlan(), joined = false, visible = true, plansById = {} } = {}) {
  const alerts = new Set()
  const spotAlertRepo = {
    upsert: vi.fn(async ({ planId, userId }) => {
      const key = `${planId}:${userId}`
      const created = !alerts.has(key)
      alerts.add(key)
      return { created }
    }),
    remove: vi.fn(async ({ planId, userId }) => alerts.delete(`${planId}:${userId}`)),
    exists: vi.fn(async ({ planId, userId }) => alerts.has(`${planId}:${userId}`)),
    findPlanIds: vi.fn(async () => [...new Set([...alerts].map((key) => key.split(':')[0]))]),
    removeByPlans: vi.fn(async (planIds) => {
      let removed = 0
      for (const key of [...alerts]) if (planIds.includes(key.split(':')[0])) { alerts.delete(key); removed += 1 }
      return removed
    })
  }
  const plans = {
    requireVisible: vi.fn(async () => {
      if (!visible) throw new AppError('NOT_FOUND', 'No encontramos ese plan')
      return plan
    })
  }
  const planRepo = { findByIds: vi.fn(async (ids) => ids.map((id) => plansById[id]).filter(Boolean)) }
  const participationRepo = { isActiveParticipant: vi.fn(async () => joined) }
  const logger = { info: vi.fn(), warn: vi.fn() }
  const service = createSpotAlertService({ plans, planRepo, participationRepo, spotAlertRepo, isFull, clock: createFixedClock(NOW), logger })
  return { service, alerts, spotAlertRepo }
}

const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code })

describe('spotAlertService.request', () => {
  it('guarda el pedido en un plan lleno y abierto', async () => {
    const { service, alerts } = setup()
    await service.request({ planId: PLAN_ID, userId: USER_ID })
    expect([...alerts]).toEqual([`${PLAN_ID}:${USER_ID}`])
  })

  it('dos pedidos del mismo usuario dejan uno solo', async () => {
    const { service, alerts } = setup()
    await service.request({ planId: PLAN_ID, userId: USER_ID })
    await service.request({ planId: PLAN_ID, userId: USER_ID })
    expect(alerts.size).toBe(1)
  })

  it('un plan con lugar responde PLAN_NOT_FULL', async () => {
    const { service, alerts } = setup({ plan: fullPlan({ participantCount: 1 }) })
    await expectCode(service.request({ planId: PLAN_ID, userId: USER_ID }), 'PLAN_NOT_FULL')
    expect(alerts.size).toBe(0)
  })

  it('un plan de cupo ilimitado nunca admite pedidos', async () => {
    const { service } = setup({ plan: fullPlan({ capacity: null, participantCount: 500 }) })
    await expectCode(service.request({ planId: PLAN_ID, userId: USER_ID }), 'PLAN_NOT_FULL')
  })

  it('un plan cerrado, cancelado o que ya empezó responde PLAN_CLOSED', async () => {
    for (const plan of [fullPlan({ status: 'closed' }), fullPlan({ status: 'cancelled' }), fullPlan({ startsAt: NOW })]) {
      const { service } = setup({ plan })
      await expectCode(service.request({ planId: PLAN_ID, userId: USER_ID }), 'PLAN_CLOSED')
    }
  })

  it('quien ya está inscripto recibe ALREADY_JOINED', async () => {
    const { service } = setup({ joined: true })
    await expectCode(service.request({ planId: PLAN_ID, userId: USER_ID }), 'ALREADY_JOINED')
  })

  it('un plan que no le es visible es NOT_FOUND', async () => {
    const { service } = setup({ visible: false })
    await expectCode(service.request({ planId: PLAN_ID, userId: USER_ID }), 'NOT_FOUND')
  })
})

describe('spotAlertService.cancel', () => {
  it('borra el pedido y es idempotente', async () => {
    const { service, alerts } = setup()
    await service.request({ planId: PLAN_ID, userId: USER_ID })
    await service.cancel({ planId: PLAN_ID, userId: USER_ID })
    await service.cancel({ planId: PLAN_ID, userId: USER_ID })
    expect(alerts.size).toBe(0)
  })
})

describe('spotAlertService.purgeExpired', () => {
  it('borra los pedidos de planes que ya empezaron, se cancelaron o ya no existen, y conserva el resto', async () => {
    const started = '885f1c2a9b1e8a00123456a1'
    const cancelled = '885f1c2a9b1e8a00123456a2'
    const gone = '885f1c2a9b1e8a00123456a3'
    const plansById = {
      [PLAN_ID]: fullPlan(),
      [started]: fullPlan({ id: started, startsAt: NOW }),
      [cancelled]: fullPlan({ id: cancelled, status: 'cancelled' })
    }
    const { service, spotAlertRepo, alerts } = setup({ plansById })
    for (const planId of [PLAN_ID, started, cancelled, gone]) await spotAlertRepo.upsert({ planId, userId: USER_ID })

    expect(await service.purgeExpired()).toBe(3)
    expect([...alerts]).toEqual([`${PLAN_ID}:${USER_ID}`])
  })
})
