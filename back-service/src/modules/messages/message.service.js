// Chat por plan (S5-BE-01 a 03). Un solo servicio para REST y Socket.io: los handlers de socket son otro "controlador"
// (docs/arquitectura/08-tiempo-real-y-push.md). Regla 6: solo el participante activo o el creador leen y escriben.
// No importa Express ni Mongoose: todo llega por parámetro (DI).
import { errors } from '../../shared/errors.js'
import { decodeCursor, encodeCursor } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'

// Clave de orden del chat: `createdAt` (ms) + `_id`, del más nuevo al más viejo.
const messagesCursorSchema = z.strictObject({ c: z.number().int().nonnegative(), i: objectIdField })

const notMember = () => errors.forbidden('Solo quienes están anotados y quien creó el plan pueden usar el chat')

/**
 * @typedef {{ message: import('./message.repository.js').MessageEntity, sender: object | null }} MessageWithSender
 */

/**
 * @param {object} deps
 * @param {{ requireVisible: (params: { planId: string, userId: string }) => Promise<{ id: string, creatorId: string }> }} deps.plans  Servicio de planes.
 * @param {{ isActiveParticipant: (planId: string, userId: string) => Promise<boolean> }} deps.participationRepo
 * @param {ReturnType<import('./message.repository.js').createMessageRepository>} deps.messageRepo
 * @param {{ findByIds: (ids: string[]) => Promise<Array<{ id: string }>> }} deps.userRepo
 * @param {{ publishMessage: (item: MessageWithSender) => void }} deps.broadcaster  Tiempo real (Socket.io); nunca lanza.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createMessageService ({ plans, participationRepo, messageRepo, userRepo, broadcaster, clock, logger }) {
  /** Suma a cada mensaje su remitente (una sola consulta para toda la página). */
  async function attachSenders (messages) {
    const senders = await userRepo.findByIds(messages.map((message) => message.senderId))
    const byId = new Map(senders.map((sender) => [sender.id, sender]))
    return messages.map((message) => ({ message, sender: byId.get(message.senderId) ?? null }))
  }

  /**
   * Permiso del chat: 404 si el plan no existe o no le es visible, 403 si no es participante activo ni creador.
   * Lo usan los listados, el envío y `chat:join` (Socket.io).
   * @param {{ planId: string, userId: string }} params  `userId` sale del token.
   * @throws {import('../../shared/errors.js').AppError} NOT_FOUND | FORBIDDEN
   */
  async function requireMember ({ planId, userId }) {
    const plan = await plans.requireVisible({ planId, userId })
    if (plan.creatorId === userId) return plan
    if (await participationRepo.isActiveParticipant(planId, userId)) return plan
    throw notMember()
  }

  return {
    requireMember,

    /**
     * Historial del chat, del más nuevo al más viejo. Solo mensajes visibles.
     * @param {{ planId: string, userId: string, limit: number, cursor?: string }} params
     * @returns {Promise<{ items: MessageWithSender[], nextCursor: string | null }>}
     * @throws {import('../../shared/errors.js').AppError} NOT_FOUND | FORBIDDEN | VALIDATION_ERROR (cursor)
     */
    async list ({ planId, userId, limit, cursor }) {
      await requireMember({ planId, userId })
      const decoded = cursor ? decodeCursor(cursor, messagesCursorSchema) : null
      const before = decoded ? { createdAt: new Date(decoded.c), id: decoded.i } : null

      // Uno de más para saber si hay otra página sin una segunda consulta.
      const found = await messageRepo.listVisibleByPlan({ planId, before, limit: limit + 1 })
      const page = found.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = found.length > limit ? encodeCursor({ c: last.createdAt.getTime(), i: last.id }) : null
      return { items: await attachSenders(page), nextCursor }
    },

    /**
     * Envía un mensaje y lo emite a la sala del plan. Idempotente por `clientId`: un reintento del mismo remitente
     * devuelve el mensaje ya creado (`created: false`) y no se vuelve a emitir.
     * @param {{ planId: string, userId: string, text: string, clientId?: string }} params  `text` ya recortado (validator).
     * @returns {Promise<MessageWithSender & { created: boolean }>}
     * @throws {import('../../shared/errors.js').AppError} NOT_FOUND | FORBIDDEN | VALIDATION_ERROR
     */
    async send ({ planId, userId, text, clientId }) {
      await requireMember({ planId, userId })

      const { message, created } = await messageRepo.create({ planId, senderId: userId, text, clientId, at: clock.now() })
      // El mismo `clientId` en otro plan no es un reintento: es un error del cliente.
      if (message.planId !== planId) {
        throw errors.validation([{ path: 'clientId', message: 'Ese identificador ya se usó para otro mensaje' }])
      }
      const [item] = await attachSenders([message])

      // Después de guardar (regla 10). Nunca el texto en el log (regla 13).
      if (created) {
        logger.info({ event: 'message.sent', planId, userId, messageId: message.id }, 'message sent')
        broadcaster.publishMessage(item)
      }
      return { ...item, created }
    }
  }
}
