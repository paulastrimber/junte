// Inscripciones y bajas (S4-BE-01 a 03) y lista de anotados. Regla 3: el contador del plan y el registro de la
// inscripción cambian en la MISMA transacción, con actualizaciones condicionales (nunca "consultar y después
// insertar"). No importa Express ni Mongoose: todo llega por parámetro (DI).
import { AppError, errors } from '../../shared/errors.js'
import { cursorInstantField, decodeCursor, encodeCursor } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'

// Clave de orden de los anotados: `joinedAt` (ms) + `_id` de la inscripción.
const participantsCursorSchema = z.strictObject({ j: cursorInstantField, i: objectIdField })

const planClosed = (message) => new AppError('PLAN_CLOSED', message)
const planFull = () => new AppError('PLAN_FULL', 'El plan no tiene cupos disponibles')

/**
 * @param {object} deps
 * @param {{ requireVisible: (params: { planId: string, userId: string }) => Promise<object> }} deps.plans  Servicio de planes.
 * @param {ReturnType<import('../plans/index.js').createPlanRepository>} deps.planRepo
 * @param {ReturnType<import('./participation.repository.js').createParticipationRepository>} deps.participationRepo
 * @param {{ exists: (planId: string, userId: string, options?: object) => Promise<boolean> }} deps.checkInRepo
 * @param {{ findByIds: (ids: string[]) => Promise<object[]> }} deps.userRepo
 * @param {typeof import('../../adapters/db/index.js').withTransaction} deps.withTransaction
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 * @param {{ removeMember: (params: { planId: string, userId: string }) => void }} [deps.chatAccess]  Saca al usuario del chat
 *   en tiempo real al darse de baja (Socket.io). Nunca lanza.
 * @param {{ remove: (params: { planId: string, userId: string }) => Promise<boolean> }} [deps.spotAlerts]  Pedidos de
 *   "avisame si se libera un lugar" (módulo `spot-alerts`): al inscribirse se borra el del usuario.
 */
export function createParticipationService ({
  plans, planRepo, participationRepo, checkInRepo, userRepo, withTransaction, clock, logger, chatAccess = { removeMember () {} },
  spotAlerts = { remove: async () => false }
}) {
  // El `$inc` condicional no se aplicó: se averigua por qué con el estado actual.
  async function explainJoinFailure (planId, now) {
    const plan = await planRepo.findById(planId)
    if (!plan) return errors.notFound('No encontramos ese plan')
    if (plan.status !== 'open') return planClosed('Las inscripciones de este plan están cerradas')
    if (plan.startsAt.getTime() <= now.getTime()) return planClosed('El plan ya empezó')
    // Abierto y sin empezar: no había lugar (aunque se haya liberado uno justo después del intento).
    return planFull()
  }

  async function explainLeaveFailure (planId, now) {
    const plan = await planRepo.findById(planId)
    if (!plan) return errors.notFound('No encontramos ese plan')
    if (plan.status !== 'open' && plan.status !== 'closed') return planClosed('El plan está cancelado o ya terminó: no admite bajas')
    if (plan.startsAt.getTime() <= now.getTime()) return planClosed('El plan ya empezó: no admite bajas')
    return errors.internal()
  }

  return {
    /**
     * Inscribe al usuario (o reactiva su inscripción cancelada): el plan tiene que estar abierto, no haber empezado y
     * tener lugar. Con cupo ilimitado nunca responde PLAN_FULL.
     * @param {{ planId: string, userId: string }} params  `userId` sale del token.
     * @returns {Promise<import('./participation.repository.js').ParticipationEntity>}
     * @throws {AppError} NOT_FOUND | PLAN_CLOSED | PLAN_FULL | ALREADY_JOINED
     */
    async join ({ planId, userId }) {
      await plans.requireVisible({ planId, userId })
      const now = clock.now()

      const participation = await withTransaction(async (session) => {
        const plan = await planRepo.incrementIfCapacity(planId, { now, session })
        if (!plan) throw await explainJoinFailure(planId, now)
        // Si ya había una inscripción activa lanza ALREADY_JOINED y la transacción revierte el `$inc`.
        return participationRepo.activate({ planId, userId, at: now }, { session })
      })

      // Después del commit (regla 10).
      logger.info({ event: 'plan.joined', planId, userId }, 'plan joined')
      // Ya tiene su lugar: su pedido de aviso no sirve más. Si falla, queda hasta que el plan empiece (job de limpieza)
      // y el aviso de cupo liberado igual saltea a los inscriptos.
      spotAlerts.remove({ planId, userId })
        .catch((err) => logger.warn({ err, planId, userId }, 'could not remove spot alert after joining'))
      return participation
    },

    /**
     * Da de baja al usuario. Idempotente: sin inscripción activa no hace nada. Con el plan empezado, cancelado o
     * completado, o con el check-in ya hecho, la baja no se admite.
     * @param {{ planId: string, userId: string }} params  `userId` sale del token.
     * @returns {Promise<{ left: boolean }>} `left: false` si no estaba inscripto.
     * @throws {AppError} NOT_FOUND | PLAN_CLOSED
     */
    async leave ({ planId, userId }) {
      const visible = await plans.requireVisible({ planId, userId })
      const now = clock.now()

      const left = await withTransaction(async (session) => {
        const cancelled = await participationRepo.cancel({ planId, userId, at: now }, { session })
        if (!cancelled) return false
        // La reputación del check-in no se deshace: quien ya registró su asistencia no se puede dar de baja.
        if (await checkInRepo.exists(planId, userId, { session })) throw planClosed('Ya registraste tu asistencia: no podés darte de baja')
        const plan = await planRepo.decrementCount(planId, { now, session })
        if (!plan) throw await explainLeaveFailure(planId, now)
        return true
      })

      // Después del commit (regla 10). El aviso de cupo liberado es de S5.
      if (left) {
        logger.info({ event: 'plan.left', planId, userId }, 'plan left')
        // Ya no es parte del plan: deja de recibir el chat aunque tenga la conexión abierta. El creador sigue en el chat.
        if (visible.creatorId !== userId) chatAccess.removeMember({ planId, userId })
      }
      return { left }
    },

    /**
     * Anotados (inscripciones activas) de un plan, con su usuario. Solo para participantes activos y el creador.
     * @param {{ planId: string, userId: string, limit: number, cursor?: string }} params
     * @returns {Promise<{ items: object[], nextCursor: string | null }>} `items`: usuarios (entidades).
     * @throws {AppError} NOT_FOUND | FORBIDDEN
     */
    async listParticipants ({ planId, userId, limit, cursor }) {
      const plan = await plans.requireVisible({ planId, userId })
      if (plan.creatorId !== userId && !(await participationRepo.isActiveParticipant(planId, userId))) {
        throw errors.forbidden('Solo quienes están anotados y quien creó el plan pueden ver la lista')
      }
      const decoded = cursor ? decodeCursor(cursor, participantsCursorSchema) : null
      const after = decoded ? { joinedAt: new Date(decoded.j), id: decoded.i } : null

      // Uno de más para saber si hay otra página sin una segunda consulta.
      const found = await participationRepo.listActiveByPlan({ planId, after, limit: limit + 1 })
      const page = found.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = found.length > limit ? encodeCursor({ j: last.joinedAt.getTime(), i: last.id }) : null

      const users = await userRepo.findByIds(page.map((participation) => participation.userId))
      const byId = new Map(users.map((user) => [user.id, user]))
      return { items: page.map((participation) => byId.get(participation.userId)).filter(Boolean), nextCursor }
    }
  }
}
