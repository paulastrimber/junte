// Acceso a la colección `sessions`. Todas las escrituras que deciden algo son atómicas
// (filtro + actualización en una sola operación): nunca "consultar y después actualizar".

/** @typedef {{ id: string, userId: string, sid: string, refreshTokenHash: string, deviceLabel?: string, lastUsedAt: Date, expiresAt: Date, revokedAt?: Date, createdAt: Date }} SessionEntity */

/** @returns {SessionEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    sid: doc.sid,
    refreshTokenHash: doc.refreshTokenHash,
    deviceLabel: doc.deviceLabel,
    lastUsedAt: doc.lastUsedAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt ?? undefined,
    createdAt: doc.createdAt
  }
}

/**
 * @param {import('mongoose').Model} SessionModel
 */
export function createSessionRepository (SessionModel) {
  // Activa = sin revokedAt (null cubre "ausente") y sin vencer.
  const activeFilter = (now) => ({ revokedAt: null, expiresAt: { $gt: now } })

  return {
    /**
     * @param {{ userId: string, sid: string, refreshTokenHash: string, deviceLabel?: string, now: Date, expiresAt: Date }} data
     * @returns {Promise<SessionEntity>}
     */
    async create ({ userId, sid, refreshTokenHash, deviceLabel, now, expiresAt }) {
      const doc = await SessionModel.create({ userId, sid, refreshTokenHash, deviceLabel, lastUsedAt: now, expiresAt })
      return toEntity(doc)
    },

    /**
     * Rota el refresh token de la sesión SOLO si el hash vigente es `currentHash` y la sesión sigue activa.
     * Devuelve null si no coincide (refresh viejo reutilizado, sesión revocada, vencida o de otro usuario).
     * @param {{ sid: string, userId: string, currentHash: string, newHash: string, now: Date, expiresAt: Date }} params
     * @returns {Promise<SessionEntity | null>}
     */
    async rotate ({ sid, userId, currentHash, newHash, now, expiresAt }) {
      const doc = await SessionModel.findOneAndUpdate(
        { sid, userId, refreshTokenHash: currentHash, ...activeFilter(now) },
        { $set: { refreshTokenHash: newHash, lastUsedAt: now, expiresAt } },
        { returnDocument: 'after' }
      )
      return doc ? toEntity(doc) : null
    },

    /**
     * Cierra una sesión. Idempotente: si ya estaba cerrada no cambia su fecha de revocación.
     * @returns {Promise<boolean>} true si esta llamada la cerró.
     */
    async revokeBySid (sid, { now }) {
      const result = await SessionModel.updateOne({ sid, revokedAt: null }, { $set: { revokedAt: now } })
      return result.modifiedCount === 1
    },

    /**
     * Cierra todas las sesiones activas de un usuario.
     * @returns {Promise<number>} cuántas cerró.
     */
    async revokeAllByUser (userId, { now }) {
      const result = await SessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } })
      return result.modifiedCount
    },

    /**
     * Deja como máximo `max` sesiones activas: revoca las más antiguas por fecha de creación.
     * Si dos logins simultáneos pasan el tope, ambos recortan y el resultado converge.
     * @returns {Promise<number>} cuántas revocó.
     */
    async revokeOldestBeyond (userId, max, { now }) {
      const active = await SessionModel.find({ userId, ...activeFilter(now) })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id')
        .lean()
      const excess = active.slice(0, Math.max(0, active.length - max)).map((doc) => doc._id)
      if (excess.length === 0) return 0
      const result = await SessionModel.updateMany({ _id: { $in: excess }, revokedAt: null }, { $set: { revokedAt: now } })
      return result.modifiedCount
    }
  }
}
