// Los refresh tokens se guardan solo como hash. SHA-256 alcanza (y es lo correcto) porque el token
// es un JWT firmado de alta entropía, no una contraseña elegida por una persona: no hace falta un hash lento.
import { createHash } from 'node:crypto'

/** @param {string} token @returns {string} sha256 en hexadecimal */
export function hashToken (token) {
  return createHash('sha256').update(token).digest('hex')
}
