// Acceso a `planParticipants`: un único registro por par plan–usuario (índice único), reactivable.
// Traduce E11000 a ALREADY_JOINED: un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'
import { AppError } from '../../shared/errors.js'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} ParticipationEntity
 * @property {string} id
 * @property {string} planId
 * @property {string} userId
 * @property {'active' | 'cancelled'} status
 * @property {Date} joinedAt
 * @property {Date} [cancelledAt]
 * @property {boolean} noShow
 * @property {Date} [noShowAt]
 */

/** @returns {ParticipationEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    planId: String(doc.planId),
    userId: String(doc.userId),
    status: doc.status,
    joinedAt: doc.joinedAt,
    cancelledAt: doc.cancelledAt,
    noShow: doc.noShow ?? false,
    noShowAt: doc.noShowAt
  }
}

const areValidIds = (...ids) => ids.every((id) => mongoose.isValidObjectId(id))

/**
 * @param {import('mongoose').Model} ParticipationModel
 */
export function createParticipationRepository (ParticipationModel) {
  const toObjectId = (id) => new mongoose.Types.ObjectId(id)

  return {
    /** @returns {Promise<boolean>} true si el usuario tiene una inscripción activa en el plan. */
    async isActiveParticipant (planId, userId) {
      if (!areValidIds(planId, userId)) return false
      return (await ParticipationModel.exists({ planId, userId, status: 'active' })) !== null
    },

    /** @returns {Promise<string[]>} IDs de los planes en los que el usuario está inscripto (inscripción activa). */
    async findActivePlanIds (userId) {
      if (!areValidIds(userId)) return []
      const docs = await ParticipationModel.find({ userId, status: 'active' }).select({ planId: 1 }).lean()
      return docs.map((doc) => String(doc.planId))
    },

    /**
     * Inscripciones del usuario (activas o canceladas) en un conjunto de planes.
     * @returns {Promise<ParticipationEntity[]>}
     */
    async findByUserAndPlans (userId, planIds) {
      const valid = planIds.filter((id) => mongoose.isValidObjectId(id))
      if (!areValidIds(userId) || valid.length === 0) return []
      const docs = await ParticipationModel.find({ userId, planId: { $in: valid } }).lean()
      return docs.map(toEntity)
    },

    /**
     * Activa la inscripción: reactiva el registro cancelado si existe, o crea uno. Va dentro de la transacción que
     * incrementa el cupo; si ya había una inscripción activa lanza ALREADY_JOINED y la transacción revierte el `$inc`.
     * @param {{ planId: string, userId: string, at: Date }} params
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<ParticipationEntity>}
     * @throws {AppError} ALREADY_JOINED
     */
    async activate ({ planId, userId, at }, { session } = {}) {
      const reactivated = await ParticipationModel.findOneAndUpdate(
        { planId, userId, status: 'cancelled' },
        { $set: { status: 'active', joinedAt: at, noShow: false }, $unset: { cancelledAt: '', noShowAt: '' } },
        { returnDocument: 'after', session }
      ).lean()
      if (reactivated) return toEntity(reactivated)

      try {
        const [created] = await ParticipationModel.create([{ planId, userId, status: 'active', joinedAt: at }], { session })
        return toEntity(created)
      } catch (err) {
        if (err?.code === DUPLICATE_KEY) throw new AppError('ALREADY_JOINED', 'Ya estás inscripto en este plan')
        throw err
      }
    },

    /**
     * Baja: pasa la inscripción activa a `cancelled`.
     * @param {{ planId: string, userId: string, at: Date }} params
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<boolean>} false si no había una inscripción activa.
     */
    async cancel ({ planId, userId, at }, { session } = {}) {
      if (!areValidIds(planId, userId)) return false
      const result = await ParticipationModel.updateOne(
        { planId, userId, status: 'active' },
        { $set: { status: 'cancelled', cancelledAt: at } },
        { session }
      )
      return result.modifiedCount === 1
    },

    /**
     * Confirma, DENTRO de una transacción, que la inscripción sigue activa y la toca: así una baja simultánea entra en
     * conflicto con el check-in en lugar de colarse entre la lectura y la escritura (invariante 4).
     * @param {{ planId: string, userId: string, at: Date }} params
     * @param {{ session: import('mongoose').ClientSession }} options
     * @returns {Promise<boolean>} false si ya no está activa.
     */
    async holdActive ({ planId, userId, at }, { session }) {
      if (!areValidIds(planId, userId)) return false
      const result = await ParticipationModel.updateOne({ planId, userId, status: 'active' }, { $set: { updatedAt: at } }, { session, timestamps: false })
      return result.matchedCount === 1
    },

    /**
     * Cierre de asistencia: marca `noShow` en las inscripciones activas del plan que no hicieron check-in.
     * @param {{ planId: string, checkedInUserIds: string[], at: Date }} params
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<number>} cuántas se marcaron.
     */
    async markNoShows ({ planId, checkedInUserIds, at }, { session } = {}) {
      if (!areValidIds(planId)) return 0
      const present = checkedInUserIds.filter((id) => mongoose.isValidObjectId(id)).map(toObjectId)
      const result = await ParticipationModel.updateMany(
        { planId, status: 'active', noShow: false, userId: { $nin: present } },
        { $set: { noShow: true, noShowAt: at } },
        { session }
      )
      return result.modifiedCount
    },

    /** @returns {Promise<number>} cuántas ausencias (`noShow`) tiene el usuario. Solo se le muestra a él. */
    async countNoShows (userId) {
      if (!areValidIds(userId)) return 0
      return ParticipationModel.countDocuments({ userId, noShow: true })
    },

    /**
     * Inscriptos activos de un plan, por orden de inscripción (`joinedAt` + `_id`), con cursor sobre esa clave.
     * Sin índice propio: un plan tiene como máximo unos cientos de inscriptos (prefijo `planId` del índice único).
     * @param {{ planId: string, after: { joinedAt: Date, id: string } | null, limit: number }} params
     * @returns {Promise<ParticipationEntity[]>}
     */
    async listActiveByPlan ({ planId, after, limit }) {
      if (!areValidIds(planId)) return []
      const clauses = [{ planId: toObjectId(planId) }, { status: 'active' }]
      if (after && mongoose.isValidObjectId(after.id)) {
        clauses.push({ $or: [{ joinedAt: { $gt: after.joinedAt } }, { joinedAt: after.joinedAt, _id: { $gt: toObjectId(after.id) } }] })
      }
      const docs = await ParticipationModel.find({ $and: clauses }).sort({ joinedAt: 1, _id: 1 }).limit(limit).lean()
      return docs.map(toEntity)
    },

    /**
     * Para las métricas del panel. `joinedSince` cuenta las inscripciones (o reactivaciones) desde esa fecha que
     * siguen activas.
     * @param {{ since: Date }} params
     * @returns {Promise<{ active: number, joinedSince: number }>}
     */
    async countMetrics ({ since }) {
      const [active, joinedSince] = await Promise.all([
        ParticipationModel.countDocuments({ status: 'active' }),
        ParticipationModel.countDocuments({ status: 'active', joinedAt: { $gte: since } })
      ])
      return { active, joinedSince }
    }
  }
}
