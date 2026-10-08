// Adapter de Redis (ioredis). Dueño: Agente A (S1-BE-04).
// Se usa para el adaptador de Socket.io y los locks de jobs; el back no guarda estado local.
import { Redis } from 'ioredis'

const CONNECT_TIMEOUT_MS = 5000
const PING_TIMEOUT_MS = 1500

/** @type {Redis | null} */
let client = null

/**
 * Crea la conexión a Redis (ioredis). Si ya hay una conexión abierta, la devuelve.
 * @param {string} url  REDIS_URL, ej. redis://localhost:6379
 * @param {{ logger?: import('pino').Logger }} [options]
 * @returns {Promise<Redis>} el cliente, para el adaptador de Socket.io y los locks.
 * @throws {Error} si no se pudo conectar (el mensaje no incluye la URL, que puede tener contraseña).
 */
export async function connectRedis (url, { logger } = {}) {
  if (client) return client

  const redis = new Redis(url, { lazyConnect: true, connectTimeout: CONNECT_TIMEOUT_MS })
  // ioredis reintenta solo; sin listener imprimiría "Unhandled error event" por consola.
  // El estado queda visible en /internal/health (pingRedis).
  redis.on('error', (err) => {
    logger?.warn({ code: err.code, reason: err.message }, 'redis connection error')
  })

  try {
    await redis.connect()
  } catch (err) {
    redis.disconnect() // corta los reintentos en segundo plano
    throw new Error('No se pudo conectar a Redis', { cause: err })
  }

  client = redis
  return client
}

/**
 * Comprueba que Redis responde (`PING`). Nunca lanza.
 * @returns {Promise<boolean>}
 */
export async function pingRedis () {
  // Sin conexión lista no se manda el comando: quedaría en la cola offline hasta reconectar.
  if (client?.status !== 'ready') return false
  let timer
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), PING_TIMEOUT_MS)
    })
    return (await Promise.race([client.ping(), timeout])) === 'PONG'
  } catch {
    return false // contrato: nunca lanza; el caller solo necesita saber si está sano
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cierra la conexión. Idempotente.
 * @returns {Promise<void>}
 */
export async function disconnectRedis () {
  if (!client) return
  const redis = client
  client = null
  try {
    await redis.quit()
  } catch {
    redis.disconnect() // quit falla si la conexión ya estaba caída: se corta igual
  }
}
