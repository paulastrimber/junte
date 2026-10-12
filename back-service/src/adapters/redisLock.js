// Lock distribuido sobre Redis para los jobs (regla 11: hay 2+ instancias del back y cada job corre una sola vez
// por ciclo). `SET clave valor NX PX ttl`: lo toma una sola instancia y vence solo por TTL. No se libera al terminar
// el job: si se liberara, otra instancia con el reloj un poco corrido lo repetiría en el mismo ciclo.
import { randomUUID } from 'node:crypto'

/**
 * @typedef {object} JobLock
 * @property {(key: string, ttlMs: number) => Promise<string | null>} acquire  Token del lock, o null si lo tiene otro.
 */

/**
 * @param {() => import('ioredis').Redis | null} getClient  Cliente ya conectado (o null si todavía no hay).
 * @param {{ prefix?: string }} [options]
 * @returns {JobLock}
 */
export function createRedisLock (getClient, { prefix = 'junte:lock:' } = {}) {
  return {
    /** @throws {Error} si Redis no está disponible: quien llama saltea el ciclo, nunca corre sin lock. */
    async acquire (key, ttlMs) {
      const client = getClient()
      if (client?.status !== 'ready') throw new Error('Redis no está disponible')
      const token = randomUUID()
      const result = await client.set(`${prefix}${key}`, token, 'PX', ttlMs, 'NX')
      return result === 'OK' ? token : null
    }
  }
}
