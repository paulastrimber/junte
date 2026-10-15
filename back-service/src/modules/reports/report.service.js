// Reportes de usuarios (S6-BE-01). La identidad sale del token y el objetivo tiene que existir y ser accesible para quien
// reporta: lo que no podría ver responde 404, no 403 (docs/arquitectura/09-seguridad.md). Un reporte nunca se muestra
// a otros usuarios: solo lo ve el panel de administración. No importa Express ni Mongoose: todo llega por parámetro (DI).
import { errors } from '../../shared/errors.js'

const notFound = {
  user: () => errors.notFound('No encontramos ese usuario'),
  plan: () => errors.notFound('No encontramos ese plan'),
  message: () => errors.notFound('No encontramos ese mensaje')
}

const ownTarget = {
  user: 'No podés reportarte a vos mismo',
  plan: 'No podés reportar un plan que creaste',
  message: 'No podés reportar un mensaje tuyo'
}

const reportingYourself = (targetType) => errors.validation([{ path: 'targetId', message: ownTarget[targetType] }], ownTarget[targetType])

/**
 * @param {object} deps
 * @param {ReturnType<import('./report.repository.js').createReportRepository>} deps.reportRepo
 * @param {{ findById: (id: string) => Promise<{ id: string } | null> }} deps.userRepo
 * @param {{ requireVisible: (params: { planId: string, userId: string }) => Promise<{ id: string, creatorId: string }> }} deps.plans  Servicio de planes.
 * @param {{ requireReadable: (params: { messageId: string, userId: string }) => Promise<{ id: string, senderId: string }> }} deps.messages  Servicio de mensajes.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createReportService ({ reportRepo, userRepo, plans, messages, clock, logger }) {
  /**
   * Comprueba que el objetivo exista, que quien reporta pueda verlo y que no sea algo propio.
   * @returns {Promise<void>}
   */
  const checkTarget = {
    async user ({ targetId, reporterId }) {
      if (targetId === reporterId) throw reportingYourself('user')
      if (!await userRepo.findById(targetId)) throw notFound.user()
    },

    async plan ({ targetId, reporterId }) {
      // requireVisible ya responde 404 a un plan que esa persona no puede ver.
      const plan = await plans.requireVisible({ planId: targetId, userId: reporterId })
      if (plan.creatorId === reporterId) throw reportingYourself('plan')
    },

    async message ({ targetId, reporterId }) {
      // Solo mensajes visibles de un chat del que es parte; si no, 404.
      const message = await messages.requireReadable({ messageId: targetId, userId: reporterId })
      if (message.senderId === reporterId) throw reportingYourself('message')
    }
  }

  return {
    /**
     * Crea un reporte pendiente. Si esa persona ya tiene uno pendiente sobre lo mismo, devuelve ese (`created: false`).
     * @param {{ reporterId: string, targetType: 'user' | 'plan' | 'message', targetId: string, reason: string, description?: string }} params
     *   Ya validado. `reporterId` sale del token.
     * @returns {Promise<{ report: import('./report.repository.js').ReportEntity, created: boolean }>}
     * @throws {import('../../shared/errors.js').AppError} NOT_FOUND | VALIDATION_ERROR
     */
    async create ({ reporterId, targetType, targetId, reason, description }) {
      await checkTarget[targetType]({ targetId, reporterId })
      const result = await reportRepo.createPending({ reporterId, targetType, targetId, reason, description, at: clock.now() })
      // Nunca la descripción en el log (texto libre de la persona).
      if (result.created) logger.info({ event: 'report.created', reportId: result.report.id, reporterId, targetType, reason }, 'report created')
      return result
    }
  }
}
