// Hash de contraseñas con Argon2id (S2-BE-01). Es un adapter: los servicios reciben `passwordHasher`
// por parámetro y los tests pasan uno rápido (tests/helpers/fast-hasher.js).
// Parámetros: mínimo recomendado por OWASP para Argon2id (19 MiB, 2 pasadas, 1 hilo). Se pueden
// subir sin migrar nada: cada hash guarda sus propios parámetros.
import argon2 from 'argon2'

const OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1
})

/**
 * @typedef {object} PasswordHasher
 * @property {(plain: string) => Promise<string>} hash
 * @property {(hash: string, plain: string) => Promise<boolean>} verify
 *   Nunca lanza por un hash mal formado (p. ej. el `!seed-no-login` de los seeds viejos): devuelve false.
 */

/** @returns {PasswordHasher} */
export function createArgon2Hasher () {
  return {
    hash: (plain) => argon2.hash(plain, OPTIONS),

    async verify (hash, plain) {
      if (typeof hash !== 'string' || hash === '') return false
      try {
        return await argon2.verify(hash, plain)
      } catch {
        // Hash con formato inválido: para el login es "credenciales incorrectas", no un 500.
        return false
      }
    }
  }
}
