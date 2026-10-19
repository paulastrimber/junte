// Acceso a `messages`. El E11000 del índice { senderId, clientId } no es un error: es un reintento del mismo mensaje,
// y el repositorio devuelve el que ya existía. Un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} MessageEntity
 * @property {string} id
 * @property {string} planId
 * @property {string} senderId
 * @property {'text'} type
 * @property {string} text
 * @property {'visible' | 'hidden'} status
 * @property {string | null} clientId
 * @property {Date} createdAt
 */

/** @returns {MessageEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    planId: String(doc.planId),
    senderId: String(doc.senderId),
    // Sin `type` (mensajes anteriores a S5) es texto.
    type: doc.type ?? 'text',
    text: doc.text,
    status: doc.status,
    clientId: doc.clientId ?? null,
    createdAt: doc.createdAt
  }
}

const isDuplicateClientId = (err) => err?.code === DUPLICATE_KEY && err.keyPattern?.clientId !== undefined

/**
 * @param {import('mongoose').Model} MessageModel
 */
export function createMessageRepository (MessageModel) {
  const toObjectId = (id) => new mongoose.Types.ObjectId(id)

  return {
    /**
     * Crea un mensaje visible. Con un `clientId` que ese remitente ya usó no crea otro: devuelve el existente.
     * @param {{ planId: string, senderId: string, text: string, clientId?: string, at: Date }} params
     * @returns {Promise<{ message: MessageEntity, created: boolean }>}
     */
    async create ({ planId, senderId, text, clientId, at }) {
      try {
        // `createdAt` del reloj inyectado (Mongoose no lo pisa si ya viene): el orden del chat usa la hora del back.
        const doc = await MessageModel.create({ planId, senderId, type: 'text', text, status: 'visible', ...(clientId ? { clientId } : {}), createdAt: at })
        return { message: toEntity(doc), created: true }
      } catch (err) {
        if (!isDuplicateClientId(err)) throw err
        const existing = await MessageModel.findOne({ senderId, clientId }).lean()
        // Lo borraron entre el choque y la lectura (no pasa hoy: los mensajes no se borran).
        if (!existing) throw err
        return { message: toEntity(existing), created: false }
      }
    },

    /**
     * Mensajes visibles de un plan, del más nuevo al más viejo (`createdAt` + `_id`), con cursor sobre esa clave.
     * Usa el índice { planId, createdAt: -1, _id: -1 }.
     * @param {{ planId: string, before: { createdAt: Date, id: string } | null, limit: number }} params
     * @returns {Promise<MessageEntity[]>}
     */
    async listVisibleByPlan ({ planId, before, limit }) {
      if (!mongoose.isValidObjectId(planId)) return []
      const clauses = [{ planId: toObjectId(planId) }, { status: 'visible' }]
      if (before && mongoose.isValidObjectId(before.id)) {
        clauses.push({ $or: [{ createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: toObjectId(before.id) } }] })
      }
      const docs = await MessageModel.find({ $and: clauses }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()
      return docs.map(toEntity)
    }
  }
}
