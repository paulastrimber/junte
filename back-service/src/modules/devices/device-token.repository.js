// Acceso a `deviceTokens`: un registro por token FCM (índice único). Un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} DeviceTokenEntity
 * @property {string} token
 * @property {string} userId
 * @property {'android' | 'ios'} platform
 */

/** @returns {DeviceTokenEntity} */
const toEntity = (doc) => ({ token: doc.token, userId: String(doc.userId), platform: doc.platform })

/**
 * @param {import('mongoose').Model} DeviceTokenModel
 */
export function createDeviceTokenRepository (DeviceTokenModel) {
  async function upsertOnce ({ token, userId, platform, at }) {
    const previous = await DeviceTokenModel.findOneAndUpdate(
      { token },
      { $set: { userId, platform, updatedAt: at }, $setOnInsert: { token, createdAt: at } },
      { upsert: true, returnDocument: 'before', timestamps: false, runValidators: true }
    ).lean()
    return { created: previous === null }
  }

  return {
    /**
     * Registra el token para ese usuario. Si el token ya existía (de este usuario o de otro: el teléfono cambió de
     * cuenta) se reasigna al usuario del JWT.
     * @param {{ token: string, userId: string, platform: string, at: Date }} params
     * @returns {Promise<{ created: boolean }>}
     */
    async upsert (params) {
      try {
        return await upsertOnce(params)
      } catch (err) {
        // Dos registros simultáneos del mismo token: el segundo upsert choca con el índice único; se reintenta como update.
        if (err?.code !== DUPLICATE_KEY) throw err
        await upsertOnce(params)
        return { created: false }
      }
    },

    /** @returns {Promise<DeviceTokenEntity | null>} */
    async findByToken (token) {
      const doc = await DeviceTokenModel.findOne({ token }).lean()
      return doc ? toEntity(doc) : null
    },

    /** Borra el token solo si es de ese usuario. @returns {Promise<boolean>} */
    async removeOwned ({ token, userId }) {
      if (!mongoose.isValidObjectId(userId)) return false
      const result = await DeviceTokenModel.deleteOne({ token, userId })
      return result.deletedCount === 1
    },

    /**
     * Tokens de un conjunto de usuarios (para enviar push).
     * @param {string[]} userIds
     * @returns {Promise<DeviceTokenEntity[]>}
     */
    async findByUserIds (userIds) {
      const valid = [...new Set(userIds)].filter((id) => mongoose.isValidObjectId(id))
      if (valid.length === 0) return []
      return (await DeviceTokenModel.find({ userId: { $in: valid } }).lean()).map(toEntity)
    },

    /**
     * Borra todos los tokens de un usuario (al recuperar la contraseña se cierran todas sus sesiones: esos teléfonos
     * dejan de recibir avisos hasta que vuelva a iniciar sesión).
     * @returns {Promise<number>}
     */
    async removeAllByUser (userId) {
      if (!mongoose.isValidObjectId(userId)) return 0
      const result = await DeviceTokenModel.deleteMany({ userId })
      return result.deletedCount
    },

    /** Borra los tokens que FCM informó como inválidos. @returns {Promise<number>} */
    async removeTokens (tokens) {
      if (tokens.length === 0) return 0
      const result = await DeviceTokenModel.deleteMany({ token: { $in: tokens } })
      return result.deletedCount
    }
  }
}
