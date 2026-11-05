// "Avisame si se libera un lugar" (S5-BE-10, docs/pendientes.md#aviso-de-cupo-liberado). No hay lista de espera: al
// liberarse un lugar se avisa a TODOS los que lo pidieron (notifier, S5-BE-08) y el primero que se inscribe se lo queda
// (lo garantiza la transacción de cupos). Un pedido dura hasta que el usuario se inscribe, lo cancela o el plan empieza.
// No importa Express ni Mongoose: todo llega por parámetro (DI).
import { AppError } from '../../shared/errors.js'

const LIVE_STATUSES = Object.freeze(['open', 'closed'])

/**
 * @param {object} deps
 * @param {{ requireVisible: (params: { planId: string, userId: string }) => Promise<object> }} deps.plans  Servicio de planes.
 * @param {{ findByIds: (ids: string[]) => Promise<Array<{ id: string, status: string, startsAt: Date }>> }} deps.planRepo
 * @param {{ isActiveParticipant: (planId: string, userId: string) => Promise<boolean> }} deps.participationRepo
 * @param {ReturnType<import('./spot-alert.repository.js').createSpotAlertRepository>} deps.spotAlertRepo
 * @param {(plan: { capacity: number | null, participantCount: number }) => boolean} deps.isFull  Regla del módulo `plans`.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createSpotAlertService ({ plans, planRepo, participationRepo, spotAlertRepo, isFull, clock, logger }) {
  return {
    /**
     * Pide el aviso. Solo sobre un plan abierto, que no empezó y que está lleno (con cupo ilimitado nunca está lleno).
     * Idempotente: pedirlo otra vez no crea otro.
     * @param {{ planId: string, userId: string }} params  `userId` sale del token.
     * @throws {AppError} NOT_FOUND | PLAN_CLOSED | ALREADY_JOINED | PLAN_NOT_FULL
     */
    async request ({ planId, userId }) {
      const plan = await plans.requireVisible({ planId, userId })
      const now = clock.now()
      if (plan.status !== 'open' || plan.startsAt.getTime() <= now.getTime()) {
        throw new AppError('PLAN_CLOSED', 'Este plan ya no admite inscripciones')
      }
      if (await participationRepo.isActiveParticipant(planId, userId)) {
        throw new AppError('ALREADY_JOINED', 'Ya estás inscripto en este plan')
      }
      if (!isFull(plan)) throw new AppError('PLAN_NOT_FULL', 'El plan tiene lugar: podés inscribirte directamente')
      const { created } = await spotAlertRepo.upsert({ planId, userId, at: now })
      if (created) logger.info({ event: 'spot_alert.requested', planId, userId }, 'spot alert requested')
    },

    /**
     * Cancela el pedido. Idempotente: sin pedido no hace nada.
     * @param {{ planId: string, userId: string }} params  `userId` sale del token.
     */
    async cancel ({ planId, userId }) {
      if (await spotAlertRepo.remove({ planId, userId })) {
        logger.info({ event: 'spot_alert.cancelled', planId, userId }, 'spot alert cancelled')
      }
    },

    /** @returns {Promise<boolean>} si el usuario pidió aviso en ese plan (`spotAlertRequested` del detalle). */
    isRequested ({ planId, userId }) {
      return spotAlertRepo.exists({ planId, userId })
    },

    /**
     * Job: borra los pedidos de planes que ya empezaron, se cancelaron, se completaron o ya no existen.
     * @returns {Promise<number>} pedidos borrados.
     */
    async purgeExpired () {
      const now = clock.now()
      const planIds = await spotAlertRepo.findPlanIds()
      if (planIds.length === 0) return 0
      const alive = new Set((await planRepo.findByIds(planIds))
        .filter((plan) => LIVE_STATUSES.includes(plan.status) && plan.startsAt.getTime() > now.getTime())
        .map((plan) => plan.id))
      return spotAlertRepo.removeByPlans(planIds.filter((planId) => !alive.has(planId)))
    }
  }
}
