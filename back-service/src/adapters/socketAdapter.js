// Adaptador de Redis para Socket.io (@socket.io/redis-adapter): con 2+ instancias del back, un `emit` a una sala
// llega también a los clientes conectados a las otras (regla 11: el back no guarda estado local). Usa la conexión
// de Redis del back para publicar y una copia para suscribirse (una conexión suscripta no puede mandar otros comandos).
import { createAdapter } from '@socket.io/redis-adapter'

/**
 * @param {import('ioredis').Redis} redis  Conexión ya abierta (connectRedis).
 * @param {{ logger: { warn: (obj: object, msg: string) => void } }} options
 * @returns {Promise<{ adapter: ReturnType<typeof createAdapter>, close: () => Promise<void> }>}
 * @throws {Error} si no se pudo abrir la conexión de suscripción.
 */
export async function createRedisSocketAdapter (redis, { logger }) {
  const subscriber = redis.duplicate()
  // Mismo criterio que connectRedis: sin listener, ioredis imprime "Unhandled error event".
  subscriber.on('error', (err) => {
    logger.warn({ code: err.code, reason: err.message }, 'redis subscriber connection error')
  })
  // La copia hereda `lazyConnect` de la conexión original.
  if (subscriber.status === 'wait') await subscriber.connect()

  return {
    adapter: createAdapter(redis, subscriber),
    async close () {
      try {
        await subscriber.quit()
      } catch {
        subscriber.disconnect()
      }
    }
  }
}
