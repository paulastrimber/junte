// Acceso a la colección `passwordResets`. Todas las escrituras que deciden algo son atómicas (filtro + actualización
// en una sola operación): nunca "consultar y después actualizar". Un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'

const DUPLICATE_KEY = 11000

/**
 * @param {import('mongoose').Model} PasswordResetModel
 */
export function createPasswordResetRepository (PasswordResetModel) {
  const isValid = (userId) => mongoose.isValidObjectId(userId)

  return {
    /**
     * Guarda un código nuevo para el usuario, si los límites lo permiten: reemplaza al anterior y pone los intentos en
     * cero. No lo guarda si el último código salió después de `cooldownBefore` o si ya se pidieron `maxRequests` en la
     * ventana actual. Dos pedidos simultáneos: gana uno solo.
     * @param {object} params
     * @param {string} params.userId
     * @param {string} params.codeHash
     * @param {Date} params.now
     * @param {Date} params.expiresAt  Hasta cuándo vale el código.
     * @param {Date} params.windowEndsAt  Fin de la ventana, si este pedido abre una nueva.
     * @param {Date} params.cooldownBefore  El último envío tiene que ser anterior a este instante.
     * @param {number} params.maxRequests  Códigos por ventana.
     * @returns {Promise<boolean>} true si el código quedó guardado (hay que mandarlo).
     */
    async issue ({ userId, codeHash, now, expiresAt, windowEndsAt, cooldownBefore, maxRequests }) {
      if (!isValid(userId)) return false
      const fresh = { codeHash, expiresAt, attempts: 0, lastSentAt: now }

      // Ventana en curso: otro código, si pasó la espera y queda cupo.
      const renewed = await PasswordResetModel.updateOne(
        { userId, windowEndsAt: { $gt: now }, lastSentAt: { $lte: cooldownBefore }, requestCount: { $lt: maxRequests } },
        { $set: fresh, $inc: { requestCount: 1 } }
      )
      if (renewed.matchedCount === 1) return true

      // Sin documento, o con la ventana vencida (el TTL todavía no lo borró): empieza una ventana nueva. Si hay una
      // ventana en curso el filtro no la encuentra, el upsert intenta insertar y choca con el índice único: no se envía.
      try {
        await PasswordResetModel.updateOne(
          { userId, windowEndsAt: { $lte: now } },
          { $set: { ...fresh, requestCount: 1, windowEndsAt } },
          { upsert: true }
        )
        return true
      } catch (err) {
        if (err?.code === DUPLICATE_KEY) return false
        throw err
      }
    },

    /**
     * Gasta un intento del código vigente (acierte o no) y devuelve su hash para compararlo. Si no hay código, venció
     * o ya se gastaron `maxAttempts`, devuelve null sin tocar nada.
     * @param {{ userId: string, now: Date, maxAttempts: number }} params
     * @returns {Promise<{ codeHash: string } | null>}
     */
    async consumeAttempt ({ userId, now, maxAttempts }) {
      if (!isValid(userId)) return null
      const doc = await PasswordResetModel.findOneAndUpdate(
        { userId, expiresAt: { $gt: now }, attempts: { $lt: maxAttempts } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
      ).lean()
      return doc ? { codeHash: doc.codeHash } : null
    },

    /**
     * Da por usado el código: borra el pedido solo si sigue siendo ese código. Va dentro de la transacción que cambia
     * la contraseña, así un código nunca sirve dos veces.
     * @param {{ userId: string, codeHash: string }} params
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<boolean>} false si ya se había usado o se reemplazó por otro.
     */
    async redeem ({ userId, codeHash }, { session } = {}) {
      if (!isValid(userId)) return false
      const result = await PasswordResetModel.deleteOne({ userId, codeHash }, { session })
      return result.deletedCount === 1
    },

    /** Borra el pedido pendiente del usuario, si hay (p. ej. cuando cambia la contraseña por otro camino). */
    async removeByUser (userId, { session } = {}) {
      if (!isValid(userId)) return
      await PasswordResetModel.deleteOne({ userId }, { session })
    }
  }
}
