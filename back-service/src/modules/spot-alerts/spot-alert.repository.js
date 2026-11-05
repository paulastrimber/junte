// Acceso a `spotAlerts`. Un pedido por par plan–usuario (índice único): pedirlo dos veces deja uno solo.
import mongoose from 'mongoose'

const DUPLICATE_KEY = 11000

const isValidId = (id) => mongoose.isValidObjectId(id)

/**
 * @param {import('mongoose').Model} SpotAlertModel
 */
export function createSpotAlertRepository (SpotAlertModel) {
  return {
    /**
     * Guarda el pedido si no existía. Idempotente: dos pedidos (aunque sean simultáneos) dejan uno solo.
     * @param {{ planId: string, userId: string, at: Date }} params
     * @returns {Promise<{ created: boolean }>}
     */
    async upsert ({ planId, userId, at }) {
      try {
        const result = await SpotAlertModel.updateOne(
          { planId, userId },
          { $setOnInsert: { planId, userId, createdAt: at, updatedAt: at } },
          { upsert: true, timestamps: false }
        )
        return { created: result.upsertedCount === 1 }
      } catch (err) {
        // Dos upserts simultáneos: el segundo choca con el índice único. El pedido ya existe.
        if (err?.code === DUPLICATE_KEY) return { created: false }
        throw err
      }
    },

    /** @returns {Promise<boolean>} false si no había pedido. */
    async remove ({ planId, userId }) {
      if (!isValidId(planId) || !isValidId(userId)) return false
      const result = await SpotAlertModel.deleteOne({ planId, userId })
      return result.deletedCount === 1
    },

    /** @returns {Promise<boolean>} */
    async exists ({ planId, userId }) {
      if (!isValidId(planId) || !isValidId(userId)) return false
      return (await SpotAlertModel.exists({ planId, userId })) !== null
    },

    /** @returns {Promise<string[]>} quiénes pidieron aviso en ese plan. */
    async findUserIdsByPlan (planId) {
      if (!isValidId(planId)) return []
      const docs = await SpotAlertModel.find({ planId }).select({ userId: 1 }).lean()
      return docs.map((doc) => String(doc.userId))
    },

    /** @returns {Promise<string[]>} planes con al menos un pedido (para la limpieza de pedidos vencidos). */
    async findPlanIds () {
      return (await SpotAlertModel.distinct('planId')).map(String)
    },

    /** @returns {Promise<number>} cuántos pedidos se borraron. */
    async removeByPlans (planIds) {
      const valid = planIds.filter(isValidId)
      if (valid.length === 0) return 0
      const result = await SpotAlertModel.deleteMany({ planId: { $in: valid } })
      return result.deletedCount
    }
  }
}
