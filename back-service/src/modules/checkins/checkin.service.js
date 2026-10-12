// Check-in (S4-BE-06, regla 4): inscripción activa + ventana + QR + distancia y precisión. El check-in y el
// `reputation +1` van en una transacción. La ubicación se usa para calcular la distancia y se descarta: no se guarda
// ni se loguea. No importa Express ni Mongoose: todo llega por parámetro (DI).
import { ATTENDANCE, isAccurateEnough, isWithinRadius, isWithinWindow } from '../../shared/attendance.js'
import { AppError, errors } from '../../shared/errors.js'
import { haversineMeters } from '../../shared/geo.js'

const notParticipant = () => errors.forbidden('Tenés que estar inscripto en el plan para registrar tu asistencia')
const qrInvalid = () => new AppError('QR_INVALID', 'El código QR no es válido o ya venció. Pedile a quien organiza que te muestre el actual')
const outOfRange = (message) => new AppError('OUT_OF_RANGE', message)

/**
 * @param {object} deps
 * @param {{ requireVisible: (params: { planId: string, userId: string }) => Promise<object> }} deps.plans  Servicio de planes.
 * @param {(plan: { status: string }) => boolean} deps.isLive  Regla del módulo `plans`.
 * @param {(params: { qrToken: unknown, planId: string, qrNonceHash?: string }) => boolean} deps.matchesQrChallenge
 * @param {ReturnType<import('../participations/index.js').createParticipationRepository>} deps.participationRepo
 * @param {ReturnType<import('./checkin.repository.js').createCheckInRepository>} deps.checkInRepo
 * @param {{ incrementReputation: (userId: string, options: object) => Promise<boolean> }} deps.userRepo
 * @param {typeof import('../../adapters/db/index.js').withTransaction} deps.withTransaction
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createCheckInService ({ plans, isLive, matchesQrChallenge, participationRepo, checkInRepo, userRepo, withTransaction, clock, logger }) {
  return {
    /**
     * Registra la asistencia del usuario. El creador inscripto no escanea su propio QR: entra sin `qrToken`, solo con
     * ubicación, y su +1 lo decide el cierre de asistencia (attendance.service.js).
     * @param {{ planId: string, userId: string, qrToken?: string, latitude: number, longitude: number, accuracyMeters: number }} params
     *   `userId` sale del token.
     * @returns {Promise<import('./checkin.repository.js').CheckInEntity>}
     * @throws {AppError} NOT_FOUND | FORBIDDEN | PLAN_CLOSED | ALREADY_CHECKED_IN | CHECKIN_WINDOW_CLOSED | QR_INVALID | OUT_OF_RANGE
     */
    async checkIn ({ planId, userId, qrToken, latitude, longitude, accuracyMeters }) {
      const plan = await plans.requireVisible({ planId, userId })
      const now = clock.now()
      const isCreator = plan.creatorId === userId

      if (!(await participationRepo.isActiveParticipant(planId, userId))) throw notParticipant()
      if (!isLive(plan)) throw new AppError('PLAN_CLOSED', 'El plan está cancelado o ya terminó')
      if (await checkInRepo.exists(planId, userId)) throw new AppError('ALREADY_CHECKED_IN', 'Ya registraste tu asistencia a este plan')
      if (!isWithinWindow({ opensAt: plan.checkInOpensAt, closesAt: plan.checkInClosesAt, now })) {
        throw new AppError('CHECKIN_WINDOW_CLOSED', 'El registro de asistencia no está habilitado en este momento')
      }
      if (!isCreator) {
        const isCurrent = matchesQrChallenge({ qrToken, planId: plan.id, qrNonceHash: plan.qrNonceHash })
        if (!isCurrent || !plan.qrExpiresAt || now.getTime() > plan.qrExpiresAt.getTime()) throw qrInvalid()
      }
      if (!isAccurateEnough(accuracyMeters)) {
        throw outOfRange(`La señal de GPS es poco precisa (se necesita una precisión de ${ATTENDANCE.MAX_ACCURACY_METERS} m o mejor). Probá al aire libre`)
      }
      const distanceMeters = haversineMeters([longitude, latitude], plan.location.coordinates)
      if (!isWithinRadius(distanceMeters, plan.checkInRadiusMeters)) {
        throw outOfRange(`Estás demasiado lejos del lugar del plan (tenés que estar a ${plan.checkInRadiusMeters} m o menos)`)
      }

      const checkIn = await withTransaction(async (session) => {
        // Una baja simultánea entra en conflicto con esta escritura: el check-in siempre implica inscripción activa.
        if (!(await participationRepo.holdActive({ planId, userId, at: now }, { session }))) throw notParticipant()
        const created = await checkInRepo.create(
          { planId, userId, checkedInAt: now, method: isCreator ? 'location' : 'qr-location', distanceMeters, accuracyMeters },
          { session }
        )
        if (!isCreator) await userRepo.incrementReputation(userId, { session })
        return created
      })

      logger.info({ event: 'plan.checked_in', planId, userId, method: checkIn.method }, 'check-in registered')
      return checkIn
    }
  }
}
