// Registro de dispositivos para push (S5-BE-06). El token se asocia al usuario del JWT; si el teléfono cambió de
// cuenta, el mismo token pasa al usuario nuevo (un dispositivo recibe los avisos de quien tiene la sesión abierta).
// No importa Express ni Mongoose: todo llega por parámetro (DI).
import { errors } from '../../shared/errors.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./device-token.repository.js').createDeviceTokenRepository>} deps.deviceTokenRepo
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createDeviceService ({ deviceTokenRepo, clock, logger }) {
  return {
    /**
     * @param {{ userId: string, token: string, platform: 'android' | 'ios' }} params  `userId` sale del token.
     * @returns {Promise<{ created: boolean }>}
     */
    async register ({ userId, token, platform }) {
      const result = await deviceTokenRepo.upsert({ token, userId, platform, at: clock.now() })
      // Nunca el token en el log (regla 13).
      logger.info({ event: 'device.registered', userId, platform, created: result.created }, 'device registered')
      return result
    },

    /**
     * Da de baja el token (al cerrar sesión). Idempotente: si ya no existía no hace nada.
     * @param {{ userId: string, token: string }} params
     * @throws {import('../../shared/errors.js').AppError} FORBIDDEN si el token es de otro usuario.
     */
    async unregister ({ userId, token }) {
      const found = await deviceTokenRepo.findByToken(token)
      if (!found) return
      if (found.userId !== userId) throw errors.forbidden('Ese dispositivo no está asociado a tu cuenta')
      await deviceTokenRepo.removeOwned({ token, userId })
      logger.info({ event: 'device.unregistered', userId }, 'device unregistered')
    }
  }
}
