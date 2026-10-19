// Acceso a `checkIns`: una asistencia por par plan–usuario (índice único). Nunca guarda coordenadas: solo la
// distancia y la precisión. Traduce E11000 a ALREADY_CHECKED_IN: un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'
import { AppError } from '../../shared/errors.js'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} CheckInEntity
 * @property {string} id
 * @property {string} planId
 * @property {string} userId
 * @property {Date} checkedInAt
 * @property {'qr-location' | 'location'} method
 * @property {number} distanceMeters
 * @property {number} [accuracyMeters]
 */

/** @returns {CheckInEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    planId: String(doc.planId),
    userId: String(doc.userId),
    checkedInAt: doc.checkedInAt,
    method: doc.method,
    distanceMeters: doc.distanceMeters,
    accuracyMeters: doc.accuracyMeters
  }
}

/**
 * @param {import('mongoose').Model} CheckInModel
 */
export function createCheckInRepository (CheckInModel) {
  return {
    /**
     * @param {{ planId: string, userId: string, checkedInAt: Date, method: string, distanceMeters: number, accuracyMeters: number }} data
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<CheckInEntity>}
     * @throws {AppError} ALREADY_CHECKED_IN
     */
    async create ({ planId, userId, checkedInAt, method, distanceMeters, accuracyMeters }, { session } = {}) {
      try {
        const [created] = await CheckInModel.create([{ planId, userId, checkedInAt, method, distanceMeters, accuracyMeters }], { session })
        return toEntity(created)
      } catch (err) {
        if (err?.code === DUPLICATE_KEY) throw new AppError('ALREADY_CHECKED_IN', 'Ya registraste tu asistencia a este plan')
        throw err
      }
    },

    /** @returns {Promise<boolean>} */
    async exists (planId, userId, { session } = {}) {
      if (!mongoose.isValidObjectId(planId) || !mongoose.isValidObjectId(userId)) return false
      return (await CheckInModel.exists({ planId, userId }).session(session ?? null)) !== null
    },

    /** @returns {Promise<string[]>} usuarios que hicieron check-in en el plan. */
    async findUserIdsByPlan (planId, { session } = {}) {
      if (!mongoose.isValidObjectId(planId)) return []
      const docs = await CheckInModel.find({ planId }).select({ userId: 1 }).session(session ?? null).lean()
      return docs.map((doc) => String(doc.userId))
    },

    /**
     * Check-ins del usuario en un conjunto de planes.
     * @returns {Promise<CheckInEntity[]>}
     */
    async findByUserAndPlans (userId, planIds) {
      const valid = planIds.filter((id) => mongoose.isValidObjectId(id))
      if (!mongoose.isValidObjectId(userId) || valid.length === 0) return []
      const docs = await CheckInModel.find({ userId, planId: { $in: valid } }).lean()
      return docs.map(toEntity)
    },

    /**
     * Para las métricas del panel.
     * @param {{ since: Date }} params
     * @returns {Promise<{ total: number, createdSince: number }>}
     */
    async countMetrics ({ since }) {
      const [total, createdSince] = await Promise.all([
        CheckInModel.countDocuments({}),
        CheckInModel.countDocuments({ checkedInAt: { $gte: since } })
      ])
      return { total, createdSince }
    }
  }
}
