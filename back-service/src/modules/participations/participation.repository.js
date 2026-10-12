// Acceso a `planParticipants`. En S3 solo lecturas (visibilidad del plan y horario ocupado del feed);
// las altas y bajas con transacción de cupo llegan en S4.
import mongoose from 'mongoose'

/**
 * @param {import('mongoose').Model} ParticipationModel
 */
export function createParticipationRepository (ParticipationModel) {
  return {
    /** @returns {Promise<boolean>} true si el usuario tiene una inscripción activa en el plan. */
    async isActiveParticipant (planId, userId) {
      if (!mongoose.isValidObjectId(planId) || !mongoose.isValidObjectId(userId)) return false
      return (await ParticipationModel.exists({ planId, userId, status: 'active' })) !== null
    },

    /** @returns {Promise<string[]>} IDs de los planes en los que el usuario está inscripto (inscripción activa). */
    async findActivePlanIds (userId) {
      if (!mongoose.isValidObjectId(userId)) return []
      const docs = await ParticipationModel.find({ userId, status: 'active' }).select({ planId: 1 }).lean()
      return docs.map((doc) => String(doc.planId))
    }
  }
}
