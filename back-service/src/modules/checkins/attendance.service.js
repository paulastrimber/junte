// Cierre de asistencia y de planes (S4-BE-07, regla 5). Lo dispara el scheduler, nunca un cliente.
// - Al cerrar la ventana de check-in: `noShow` en las inscripciones activas sin check-in y el +1 del creador.
// - Al llegar `endsAt`: el plan pasa a `completed`.
// Cada paso es una transacción con una actualización condicional sobre el plan, así corre UNA sola vez aunque dos
// instancias lleguen juntas. No importa Express ni Mongoose: todo llega por parámetro (DI).
import { ATTENDANCE } from '../../shared/attendance.js'

// Tope de planes por pasada: lo que quede se procesa en el ciclo siguiente.
const BATCH_SIZE = 100

/**
 * @param {object} deps
 * @param {ReturnType<import('../plans/index.js').createPlanRepository>} deps.planRepo
 * @param {ReturnType<import('../participations/index.js').createParticipationRepository>} deps.participationRepo
 * @param {ReturnType<import('./checkin.repository.js').createCheckInRepository>} deps.checkInRepo
 * @param {{ incrementReputation: (userId: string, options: object) => Promise<boolean> }} deps.userRepo
 * @param {typeof import('../../adapters/db/index.js').withTransaction} deps.withTransaction
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void, error: (obj: object, msg: string) => void }} deps.logger
 * @param {number} [deps.creatorMinOtherCheckIns]  Check-ins de otros que necesita el creador para su +1.
 */
export function createAttendanceService ({
  planRepo, participationRepo, checkInRepo, userRepo, withTransaction, clock, logger,
  creatorMinOtherCheckIns = ATTENDANCE.CREATOR_MIN_OTHER_CHECKINS
}) {
  /**
   * Dentro de una transacción: marca el plan como procesado y, solo si lo logró, aplica las consecuencias.
   * @returns {Promise<{ noShows: number, creatorRewarded: boolean } | null>} null si no correspondía cerrarla.
   */
  async function closeInSession (planId, now, session) {
    const plan = await planRepo.markAttendanceClosed(planId, { now, session })
    if (!plan) return null

    const present = await checkInRepo.findUserIdsByPlan(planId, { session })
    const noShows = await participationRepo.markNoShows({ planId, checkedInUserIds: present, at: now }, { session })

    // El creador no sumó al hacer su check-in: lo recibe ahora, si además fueron suficientes participantes.
    const others = present.filter((userId) => userId !== plan.creatorId).length
    const creatorRewarded = present.includes(plan.creatorId) && others >= creatorMinOtherCheckIns
    if (creatorRewarded) await userRepo.incrementReputation(plan.creatorId, { session })
    return { noShows, creatorRewarded }
  }

  /** Procesa una lista de planes; el fallo de uno no frena a los demás (se reintenta en el próximo ciclo). */
  async function processEach (planIds, work) {
    let processed = 0
    for (const planId of planIds) {
      try {
        if (await work(planId)) processed += 1
      } catch (err) {
        logger.error({ err, planId }, 'attendance job failed for plan')
      }
    }
    return processed
  }

  const service = {
    /**
     * Cierra la asistencia de un plan cuya ventana de check-in ya cerró. Idempotente.
     * @param {string} planId
     * @returns {Promise<{ noShows: number, creatorRewarded: boolean } | null>} null si no correspondía.
     */
    async closeAttendance (planId) {
      const now = clock.now()
      const result = await withTransaction((session) => closeInSession(planId, now, session))
      if (result) logger.info({ event: 'plan.attendance_closed', planId, ...result }, 'attendance closed')
      return result
    },

    /**
     * Pasa a `completed` un plan que ya terminó. Si la asistencia no se había cerrado (el scheduler estuvo caído),
     * se cierra en la misma transacción.
     * @param {string} planId
     * @returns {Promise<boolean>} false si no correspondía.
     */
    async completePlan (planId) {
      const now = clock.now()
      const completed = await withTransaction(async (session) => {
        await closeInSession(planId, now, session)
        return (await planRepo.complete(planId, { now, session })) !== null
      })
      if (completed) logger.info({ event: 'plan.completed', planId }, 'plan completed')
      return completed
    },

    /** Job: cierra la asistencia de todos los planes que la tienen pendiente. @returns {Promise<number>} procesados. */
    async closeDueAttendance () {
      const planIds = await planRepo.findIdsDueForAttendanceClose({ now: clock.now(), limit: BATCH_SIZE })
      return processEach(planIds, async (planId) => (await service.closeAttendance(planId)) !== null)
    },

    /** Job: completa todos los planes que ya terminaron. @returns {Promise<number>} procesados. */
    async completeDuePlans () {
      const planIds = await planRepo.findIdsDueForCompletion({ now: clock.now(), limit: BATCH_SIZE })
      return processEach(planIds, (planId) => service.completePlan(planId))
    }
  }

  return service
}
