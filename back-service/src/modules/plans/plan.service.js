// Reglas de negocio de los planes (S3-BE-01 a 04 y 08; estados, QR y "Mis planes" de S4). No importa Express ni Mongoose: recibe repositorios,
// catálogos, storage y reloj por parámetro (DI).
import { ageOn, calendarDateIn, fromUtcMidnight } from '../../shared/age.js'
import { ATTENDANCE, isWithinWindow } from '../../shared/attendance.js'
import { RADIUS_KM } from '../../shared/geo.js'
import { AppError, errors } from '../../shared/errors.js'
import { decodeCursor, encodeCursor } from '../../shared/pagination.js'
import { planObjectPrefix, verifyUploadedImage } from '../../shared/uploads.js'
import { objectIdField, z } from '../../shared/validation.js'
import { createQrChallenge } from './plan.qr.js'
import { EDITABLE_STATUSES, PRICE_RANGES, STATUS_TRANSITIONS, canTransition, checkSchedule, isLive, isPubliclyVisible } from './plan.rules.js'

// Clave de orden del listado cronológico: `startsAt` (ms) + `_id`.
const listCursorSchema = z.strictObject({ s: z.number().int().nonnegative(), i: objectIdField })

const planNotFound = () => errors.notFound('No encontramos ese plan')
const notEditable = () => new AppError('PLAN_CLOSED', 'El plan ya no se puede editar')
const notLive = () => new AppError('PLAN_CLOSED', 'El plan está cancelado o ya terminó')
const outsideWindow = () => new AppError('CHECKIN_WINDOW_CLOSED', 'El registro de asistencia no está habilitado en este momento')

const STATUS_CHANGE_ERRORS = Object.freeze({
  closed: 'Solo se pueden cerrar las inscripciones de un plan abierto que todavía no empezó',
  open: 'Solo se pueden reabrir las inscripciones de un plan cerrado que todavía no empezó',
  cancelled: 'El plan ya terminó o ya estaba cancelado'
})

/**
 * @param {object} deps
 * @param {ReturnType<import('./plan.repository.js').createPlanRepository>} deps.planRepo
 * @param {{ findById: (id: string) => Promise<object | null>, findByIds: (ids: string[]) => Promise<object[]> }} deps.userRepo
 * @param {ReturnType<import('../participations/index.js').createParticipationRepository>} deps.participationRepo
 * @param {{ findByUserAndPlans: (userId: string, planIds: string[]) => Promise<Array<{ planId: string, checkedInAt: Date }>> }} deps.checkInRepo
 * @param {{ checkInterests: (params: object) => Promise<Array<{ path: string, message: string }>> }} deps.catalogs
 * @param {(user: object) => boolean} deps.isProfileComplete  Regla del módulo `users`.
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ warn: (obj: object, msg: string) => void }} deps.logger
 */
export function createPlanService ({ planRepo, userRepo, participationRepo, checkInRepo, catalogs, isProfileComplete, storage, clock, logger }) {
  async function requireUser (userId) {
    // authenticate ya comprobó que existe; si desapareció en el medio, la sesión ya no corresponde a un usuario.
    const user = await userRepo.findById(userId)
    if (!user) throw errors.unauthenticated()
    return user
  }

  const ageOf = (user) => (user.birthDate ? ageOn(fromUtcMidnight(user.birthDate), calendarDateIn(clock.now())) : null)

  /** 404 si el plan no existe o no es visible para ese usuario (no se revela que existe). */
  async function loadVisible (planId, userId) {
    const plan = await planRepo.findById(planId)
    if (!plan) throw planNotFound()
    if (plan.creatorId === userId || isPubliclyVisible(plan, clock.now())) return plan
    if (await participationRepo.isActiveParticipant(planId, userId)) return plan
    throw planNotFound()
  }

  async function loadOwned (planId, userId) {
    const plan = await loadVisible(planId, userId)
    if (plan.creatorId !== userId) throw errors.forbidden('Solo quien creó el plan puede modificarlo')
    return plan
  }

  /** Suma a cada plan su creador (una sola consulta para toda la página). */
  async function attachCreators (plans) {
    const creators = await userRepo.findByIds(plans.map((plan) => plan.creatorId))
    const byId = new Map(creators.map((creator) => [creator.id, creator]))
    return plans.map((plan) => ({ plan, creator: byId.get(plan.creatorId) ?? null }))
  }

  /** Suma a cada item el estado del usuario en ese plan: inscripción, check-in y noShow (null si nunca se inscribió). */
  async function attachMyParticipation (items, userId) {
    const planIds = items.map(({ plan }) => plan.id)
    const [participations, checkIns] = await Promise.all([
      participationRepo.findByUserAndPlans(userId, planIds),
      checkInRepo.findByUserAndPlans(userId, planIds)
    ])
    const participationByPlan = new Map(participations.map((participation) => [participation.planId, participation]))
    const checkedInAtByPlan = new Map(checkIns.map((checkIn) => [checkIn.planId, checkIn.checkedInAt]))
    return items.map((item) => {
      const participation = participationByPlan.get(item.plan.id)
      const myParticipation = participation
        ? { status: participation.status, joinedAt: participation.joinedAt, noShow: participation.noShow, checkedInAt: checkedInAtByPlan.get(item.plan.id) ?? null }
        : null
      return { ...item, myParticipation }
    })
  }

  /** Detalle de un plan para un usuario: plan + creador + su propio estado. */
  const withDetail = async (plan, userId) => (await attachMyParticipation(await attachCreators([plan]), userId))[0]

  /** Cambio de estado del creador: una sola operación condicional (nunca "consultar y después escribir"). */
  async function changeStatus (current, userId, to) {
    if (current.status === to) return current
    const now = clock.now()
    const notAllowed = () => new AppError('PLAN_CLOSED', STATUS_CHANGE_ERRORS[to])
    if (!canTransition({ plan: current, to, now })) throw notAllowed()

    const { from, until } = STATUS_TRANSITIONS[to]
    const updated = await planRepo.transitionStatus(current.id, userId, { from: [...from], to, ...(until === 'start' ? { startsAfter: now } : { endsAfter: now }) })
    // Cambió entre la lectura y la escritura (otro pedido, o el job lo completó).
    if (!updated) throw notAllowed()
    logger.info({ event: 'plan.status_changed', planId: current.id, userId, from: current.status, to }, 'plan status changed')
    return updated
  }

  // La actualización condicional no se aplicó: se averigua por qué con el estado actual.
  async function explainUpdateFailure (planId, userId, changes) {
    const plan = await planRepo.findById(planId)
    if (!plan) return planNotFound()
    if (plan.creatorId !== userId) return errors.forbidden('Solo quien creó el plan puede modificarlo')
    if (!EDITABLE_STATUSES.includes(plan.status)) return notEditable()
    if (typeof changes.capacity === 'number' && changes.capacity < plan.participantCount) {
      return new AppError('CAPACITY_BELOW_PARTICIPANTS', `El cupo no puede ser menor que los ${plan.participantCount} inscriptos`)
    }
    return errors.internal()
  }

  return {
    attachCreators,

    /** Opciones de los filtros del feed (la app arma sus controles con esto: no tiene los rangos escritos). */
    getFilterOptions () {
      return {
        priceRanges: PRICE_RANGES.map(({ key, min, max }) => ({ key, min, max })),
        radiusKm: { min: RADIUS_KM.MIN, max: RADIUS_KM.MAX, default: RADIUS_KM.DEFAULT }
      }
    },

    /**
     * Crea un plan. `creatorId` sale del token y `university` del perfil del creador. No consume cupo:
     * el creador se inscribe aparte si quiere participar.
     * @param {{ creatorId: string, data: object }} params  `data` ya validado en su forma (Zod strict).
     * @throws {AppError} PROFILE_INCOMPLETE | VALIDATION_ERROR con `details` por campo.
     */
    async create ({ creatorId, data }) {
      const creator = await requireUser(creatorId)
      if (!isProfileComplete(creator)) {
        throw new AppError('PROFILE_INCOMPLETE', 'Completá tu perfil (nombre, fecha de nacimiento y al menos un interés) para crear planes')
      }

      const details = [
        ...checkSchedule({ startsAt: data.startsAt, endsAt: data.endsAt, now: clock.now(), mustStartInFuture: true }),
        ...await catalogs.checkInterests({ keys: data.interests, age: ageOf(creator) })
      ]
      if (details.length > 0) throw errors.validation(details)

      const plan = await planRepo.create({ ...data, creatorId, university: creator.university })
      return { plan, creator, myParticipation: null }
    },

    /**
     * Detalle de un plan, con el creador y el estado del usuario en él.
     * @throws {AppError} NOT_FOUND si no existe o no es visible para el usuario.
     */
    async getVisible ({ planId, userId }) {
      return withDetail(await loadVisible(planId, userId), userId)
    },

    /**
     * El plan, sin nada más, para otros módulos (inscripciones, check-in): 404 si no existe o el usuario no lo ve.
     * @returns {Promise<import('./plan.repository.js').PlanEntity>}
     */
    async requireVisible ({ planId, userId }) {
      return loadVisible(planId, userId)
    },

    /** Para otros módulos (p. ej. la URL firmada de la foto del plan): 404 si no lo ve, 403 si no es su creador. */
    async assertCreator ({ planId, userId }) {
      return loadOwned(planId, userId)
    },

    /**
     * Edita un plan (cambio parcial). Solo su creador y mientras esté abierto o cerrado. Las fechas y los intereses
     * se validan sobre el plan RESULTANTE; el cupo se comprueba en la misma operación que escribe.
     * @param {{ planId: string, userId: string, changes: object }} params
     * Con `status` (que llega solo: lo exige el validator) es un cambio de estado: cerrar o reabrir inscripciones, o cancelar.
     * @throws {AppError} NOT_FOUND | FORBIDDEN | PLAN_CLOSED | CAPACITY_BELOW_PARTICIPANTS | VALIDATION_ERROR
     */
    async update ({ planId, userId, changes }) {
      const current = await loadOwned(planId, userId)
      if (changes.status !== undefined) return withDetail(await changeStatus(current, userId, changes.status), userId)
      if (!EDITABLE_STATUSES.includes(current.status)) throw notEditable()

      const details = []
      if (changes.startsAt !== undefined || changes.endsAt !== undefined) {
        const startsAt = changes.startsAt ?? current.startsAt
        const startChanged = startsAt.getTime() !== current.startsAt.getTime()
        details.push(...checkSchedule({ startsAt, endsAt: changes.endsAt ?? current.endsAt, now: clock.now(), mustStartInFuture: startChanged }))
      }
      if (changes.interests !== undefined) {
        const creator = await requireUser(userId)
        details.push(...await catalogs.checkInterests({ keys: changes.interests, kept: current.interests, age: ageOf(creator) }))
      }
      if (details.length > 0) throw errors.validation(details)

      const updated = await planRepo.updateByCreator(planId, userId, changes)
      if (!updated) throw await explainUpdateFailure(planId, userId, changes)
      return withDetail(updated, userId)
    },

    /**
     * Genera el desafío QR de asistencia (S4-BE-04). Solo el creador, con el plan vivo y dentro de la ventana de
     * check-in. Hay un único QR válido por plan: uno nuevo invalida el anterior. El token no se guarda ni se loguea.
     * @param {{ planId: string, userId: string }} params
     * @returns {Promise<{ qrToken: string, expiresAt: Date }>}
     * @throws {AppError} NOT_FOUND | FORBIDDEN | PLAN_CLOSED | CHECKIN_WINDOW_CLOSED
     */
    async generateQr ({ planId, userId }) {
      const plan = await loadOwned(planId, userId)
      const now = clock.now()
      if (!isLive(plan)) throw notLive()
      if (!isWithinWindow({ opensAt: plan.checkInOpensAt, closesAt: plan.checkInClosesAt, now })) throw outsideWindow()

      const { qrToken, qrNonceHash } = createQrChallenge(plan.id)
      const expiresAt = new Date(Math.min(now.getTime() + ATTENDANCE.QR_TTL_MS, plan.checkInClosesAt.getTime()))
      const updated = await planRepo.setQr(plan.id, userId, { qrNonceHash, qrExpiresAt: expiresAt, now })
      // Cambió entre la lectura y la escritura: se canceló, se completó o cambiaron las fechas.
      if (!updated) {
        const latest = await planRepo.findById(plan.id)
        throw latest && isLive(latest) ? outsideWindow() : notLive()
      }
      return { qrToken, expiresAt }
    },

    /**
     * "Mis planes" (S4-MOB-04): los que creó o aquellos en los que está inscripto (inscripción activa), en cualquier
     * estado, con su propio estado en cada uno.
     * @param {{ userId: string, role: 'created' | 'joined', when: 'upcoming' | 'past', limit: number, cursor?: string }} params
     * @returns {Promise<{ items: object[], nextCursor: string | null }>}
     */
    async listMine ({ userId, role, when, limit, cursor }) {
      const decoded = cursor ? decodeCursor(cursor, listCursorSchema) : null
      const after = decoded ? { startsAt: new Date(decoded.s), id: decoded.i } : null
      const scope = role === 'created' ? { creatorId: userId } : { ids: await participationRepo.findActivePlanIds(userId) }

      const found = await planRepo.listMine({ scope, when, now: clock.now(), after, limit: limit + 1 })
      const page = found.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = found.length > limit ? encodeCursor({ s: last.startsAt.getTime(), i: last.id }) : null
      return { items: await attachMyParticipation(await attachCreators(page), userId), nextCursor }
    },

    /**
     * Vincula la foto subida a S3 (mismo flujo que la de perfil): creador → dueño de la clave → existencia → tipo y
     * tamaño reales. La clave cuelga de `plans/<planId>/`.
     * @param {{ planId: string, userId: string, objectKey: string }} params
     */
    async setPhoto ({ planId, userId, objectKey }) {
      const current = await loadOwned(planId, userId)
      await verifyUploadedImage({ storage, objectKey, prefix: planObjectPrefix(planId) })

      const updated = await planRepo.setPhotoKey(planId, userId, objectKey)
      if (!updated) throw planNotFound()

      // Después de guardar: la foto anterior ya no la referencia nadie. Si falla, queda huérfana (se loguea).
      if (current.photoKey && current.photoKey !== objectKey) {
        await storage.deleteObject(current.photoKey).catch((err) => {
          logger.warn({ err, planId }, 'could not delete previous plan photo')
        })
      }
      return withDetail(updated, userId)
    },

    /**
     * Listado cronológico (sin `near`): planes abiertos que todavía no empezaron, con los filtros predefinidos.
     * @param {{ filters: import('./plan.repository.js').PlanFilters, limit: number, cursor?: string }} params
     * @returns {Promise<{ items: Array<{ plan: object, creator: object | null }>, nextCursor: string | null }>}
     */
    async list ({ filters, limit, cursor }) {
      const decoded = cursor ? decodeCursor(cursor, listCursorSchema) : null
      const after = decoded ? { startsAt: new Date(decoded.s), id: decoded.i } : null

      // Uno de más para saber si hay otra página sin una segunda consulta.
      const found = await planRepo.listUpcoming({ filters, now: clock.now(), after, limit: limit + 1 })
      const page = found.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = found.length > limit ? encodeCursor({ s: last.startsAt.getTime(), i: last.id }) : null
      return { items: await attachCreators(page), nextCursor }
    }
  }
}
