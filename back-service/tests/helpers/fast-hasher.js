// Hasher rápido para tests (mismo contrato que adapters/passwordHasher.js, sin el costo de Argon2).
// NO es seguro: solo para tests. Con sal aleatoria, para que dos hashes de la misma contraseña difieran.
import { createHash, randomBytes } from 'node:crypto'

const PREFIX = 'fast$'

const digest = (salt, plain) => createHash('sha256').update(`${salt}:${plain}`).digest('hex')

export function createFastHasher () {
  return {
    async hash (plain) {
      const salt = randomBytes(8).toString('hex')
      return `${PREFIX}${salt}$${digest(salt, plain)}`
    },
    async verify (hash, plain) {
      if (typeof hash !== 'string' || !hash.startsWith(PREFIX)) return false
      const [salt, expected] = hash.slice(PREFIX.length).split('$')
      return typeof expected === 'string' && digest(salt, plain) === expected
    }
  }
}
