// Acceso a `reports`. El E11000 del índice único parcial { reporterId, targetType, targetId } (solo pendientes) no es un
// error: es el mismo reporte otra vez, y el repositorio devuelve el que ya existía. Un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} ReportEntity
 * @property {string} id
 * @property {string} reporterId
 * @property {'user' | 'plan' | 'message'} targetType
 * @property {string} targetId
 * @property {string} reason
 * @property {string | null} description
 * @property {'pending' | 'reviewed' | 'dismissed'} status
 * @property {string | null} resolvedBy
 * @property {Date | null} resolvedAt
 * @property {Date} createdAt
 */

/** @returns {ReportEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    reporterId: String(doc.reporterId),
    targetType: doc.targetType,
    targetId: String(doc.targetId),
    reason: doc.reason,
    description: doc.description ?? null,
    status: doc.status,
    resolvedBy: doc.resolvedBy ? String(doc.resolvedBy) : null,
    resolvedAt: doc.resolvedAt ?? null,
    createdAt: doc.createdAt
  }
}

const isDuplicatePending = (err) => err?.code === DUPLICATE_KEY && err.keyPattern?.reporterId !== undefined

/**
 * @param {import('mongoose').Model} ReportModel
 */
export function createReportRepository (ReportModel) {
  const toObjectId = (id) => new mongoose.Types.ObjectId(id)

  /**
   * Crea un reporte pendiente. Si esa persona ya tiene uno pendiente sobre lo mismo, devuelve ese (no crea otro).
   * @param {{ reporterId: string, targetType: string, targetId: string, reason: string, description?: string, at: Date }} data
   * @param {number} [attempt]
   * @returns {Promise<{ report: ReportEntity, created: boolean }>}
   */
  async function createPending (data, attempt = 1) {
    const { reporterId, targetType, targetId, reason, description, at } = data
    try {
      const doc = await ReportModel.create({
        reporterId, targetType, targetId, reason, ...(description ? { description } : {}), status: 'pending', createdAt: at
      })
      return { report: toEntity(doc), created: true }
    } catch (err) {
      if (!isDuplicatePending(err)) throw err
      const existing = await ReportModel.findOne({ reporterId, targetType, targetId, status: 'pending' }).lean()
      if (existing) return { report: toEntity(existing), created: false }
      // Lo resolvieron entre el choque y la lectura: ya no hay un pendiente que choque, se intenta una vez más.
      if (attempt > 1) throw err
      return createPending(data, attempt + 1)
    }
  }

  return {
    createPending,

    /** @returns {Promise<ReportEntity | null>} */
    async findById (id) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await ReportModel.findById(id).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Cola de moderación por estado, paginada por `createdAt` + `_id`. Los pendientes van del más viejo al más nuevo
     * (se atienden en orden de llegada); los resueltos, del más nuevo al más viejo (historial).
     * Usa el índice { status, createdAt }.
     * @param {{ status: string, order: 'asc' | 'desc', after: { createdAt: Date, id: string } | null, limit: number }} params
     * @returns {Promise<ReportEntity[]>}
     */
    async listByStatus ({ status, order, after, limit }) {
      const direction = order === 'asc' ? 1 : -1
      const beyond = order === 'asc' ? '$gt' : '$lt'
      const clauses = [{ status }]
      if (after && mongoose.isValidObjectId(after.id)) {
        clauses.push({ $or: [{ createdAt: { [beyond]: after.createdAt } }, { createdAt: after.createdAt, _id: { [beyond]: toObjectId(after.id) } }] })
      }
      const docs = await ReportModel.find({ $and: clauses }).sort({ createdAt: direction, _id: direction }).limit(limit).lean()
      return docs.map(toEntity)
    },

    /**
     * Cuántos reportes pendientes tiene cada objetivo (todas las personas que lo reportaron).
     * @param {Array<{ targetType: string, targetId: string }>} targets
     * @returns {Promise<Map<string, number>>} clave `${targetType}:${targetId}`.
     */
    async countPendingByTargets (targets) {
      const valid = targets.filter(({ targetId }) => mongoose.isValidObjectId(targetId))
      if (valid.length === 0) return new Map()
      const rows = await ReportModel.aggregate([
        { $match: { status: 'pending', $or: valid.map(({ targetType, targetId }) => ({ targetType, targetId: toObjectId(targetId) })) } },
        { $group: { _id: { targetType: '$targetType', targetId: '$targetId' }, count: { $sum: 1 } } }
      ])
      return new Map(rows.map(({ _id, count }) => [`${_id.targetType}:${String(_id.targetId)}`, count]))
    },

    /**
     * Resuelve TODOS los reportes pendientes sobre un mismo objetivo (la decisión es sobre el contenido, no sobre quién
     * lo reportó). Condicional sobre `status: 'pending'`: si dos admins resuelven a la vez, cada reporte se resuelve una vez.
     * @param {{ targetType: string, targetId: string, status: 'reviewed' | 'dismissed', resolvedBy: string, at: Date }} params
     * @returns {Promise<number>} cuántos resolvió.
     */
    async resolvePendingForTarget ({ targetType, targetId, status, resolvedBy, at }) {
      if (!mongoose.isValidObjectId(targetId)) return 0
      const result = await ReportModel.updateMany(
        { targetType, targetId: toObjectId(targetId), status: 'pending' },
        { $set: { status, resolvedBy: toObjectId(resolvedBy), resolvedAt: at } }
      )
      return result.modifiedCount
    },

    /**
     * Cambia la resolución de un reporte ya resuelto (un admin corrige "revisado" ↔ "descartado"). Nunca vuelve a pendiente.
     * @param {string} id
     * @param {{ status: 'reviewed' | 'dismissed', resolvedBy: string, at: Date }} resolution
     * @returns {Promise<ReportEntity | null>}
     */
    async changeResolution (id, { status, resolvedBy, at }) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await ReportModel.findOneAndUpdate(
        { _id: id, status: { $ne: 'pending' } },
        { $set: { status, resolvedBy: toObjectId(resolvedBy), resolvedAt: at } },
        { returnDocument: 'after', runValidators: true }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Para las métricas del panel.
     * @param {{ since: Date }} params
     * @returns {Promise<{ pending: number, createdSince: number }>}
     */
    async countMetrics ({ since }) {
      const [pending, createdSince] = await Promise.all([
        ReportModel.countDocuments({ status: 'pending' }),
        ReportModel.countDocuments({ createdAt: { $gte: since } })
      ])
      return { pending, createdSince }
    }
  }
}
