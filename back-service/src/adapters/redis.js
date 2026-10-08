// Contrato del adapter de Redis. Dueño: Agente A (S1-BE-04).

/**
 * Crea la conexión a Redis (ioredis).
 * @param {string} url  REDIS_URL, ej. redis://localhost:6379
 * @returns {Promise<import('ioredis').Redis>} el cliente, para el adaptador de Socket.io y los locks.
 */
export async function connectRedis (url) {
  throw new Error('Not implemented: connectRedis (S1-BE-04)')
}

/**
 * Comprueba que Redis responde (`PING`). Nunca lanza.
 * @returns {Promise<boolean>}
 */
export async function pingRedis () {
  throw new Error('Not implemented: pingRedis (S1-BE-04)')
}

/**
 * Cierra la conexión. Idempotente.
 * @returns {Promise<void>}
 */
export async function disconnectRedis () {
  throw new Error('Not implemented: disconnectRedis (S1-BE-04)')
}
