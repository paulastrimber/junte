// Códigos de recuperación de contraseña: 6 dígitos al azar que llegan por email.
// Se guarda solo su HMAC-SHA256 con una clave derivada del secreto del back. Un hash simple no alcanzaría: con un
// millón de combinaciones, quien lea la base recupera el código en segundos; con el HMAC además necesita el secreto.
// El HMAC incluye el usuario: el código de una cuenta no sirve para otra.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const RESET_CODE_LENGTH = 6
const CODE_SPACE = 10 ** RESET_CODE_LENGTH
// Separa esta clave de la que firma los JWT, aunque salgan del mismo secreto.
const KEY_CONTEXT = 'junte:password-reset:v1'

/**
 * @param {{ secret: string }} params  El secreto del back (JWT_SECRET).
 */
export function createResetCodes ({ secret }) {
  const key = createHmac('sha256', secret).update(KEY_CONTEXT).digest()
  const hash = (userId, code) => createHmac('sha256', key).update(`${userId}:${code}`).digest('hex')

  return {
    /** @returns {string} seis dígitos, con ceros a la izquierda. */
    generate: () => String(randomInt(0, CODE_SPACE)).padStart(RESET_CODE_LENGTH, '0'),

    hash,

    /**
     * Compara en tiempo constante.
     * @param {string} storedHash  Lo guardado en `passwordResets.codeHash`.
     * @param {string} userId
     * @param {string} code  Lo que escribió la persona.
     */
    matches (storedHash, userId, code) {
      const expected = Buffer.from(hash(userId, code), 'hex')
      const stored = Buffer.from(String(storedHash), 'hex')
      return stored.length === expected.length && timingSafeEqual(stored, expected)
    }
  }
}
