// Desafío QR de asistencia (regla 4): un nonce aleatorio con vencimiento, nunca el ID del plan solo.
// En la base se guarda el SHA-256 del nonce (`qrNonceHash`); el token completo solo lo ve el creador.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const NONCE_BYTES = 32
// 32 bytes en base64url, sin relleno.
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SEPARATOR = '.'

const hashNonce = (nonce) => createHash('sha256').update(nonce).digest('hex')

/**
 * Genera un desafío para un plan. El token lleva el plan adentro (`<planId>.<nonce>`): el QR de otro plan se
 * rechaza sin consultar nada más.
 * @param {string} planId
 * @returns {{ qrToken: string, qrNonceHash: string }}
 */
export function createQrChallenge (planId) {
  const nonce = randomBytes(NONCE_BYTES)
  return { qrToken: `${planId}${SEPARATOR}${nonce.toString('base64url')}`, qrNonceHash: hashNonce(nonce) }
}

/**
 * ¿El token es el desafío vigente de ese plan? No mira el vencimiento (eso lo decide el servicio con su reloj).
 * La comparación de hashes es en tiempo constante.
 * @param {{ qrToken: unknown, planId: string, qrNonceHash?: string }} params
 * @returns {boolean}
 */
export function matchesQrChallenge ({ qrToken, planId, qrNonceHash }) {
  if (typeof qrToken !== 'string' || typeof qrNonceHash !== 'string') return false
  const separatorAt = qrToken.indexOf(SEPARATOR)
  if (separatorAt === -1) return false
  const tokenPlanId = qrToken.slice(0, separatorAt)
  const encodedNonce = qrToken.slice(separatorAt + 1)
  if (tokenPlanId !== planId || !NONCE_PATTERN.test(encodedNonce)) return false

  const expected = Buffer.from(qrNonceHash, 'hex')
  const received = Buffer.from(hashNonce(Buffer.from(encodedNonce, 'base64url')), 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}
