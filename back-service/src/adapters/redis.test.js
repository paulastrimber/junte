// Comportamiento del adapter sin un Redis real: el camino feliz se cubre con docker-compose (task up).
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { connectRedis, disconnectRedis, pingRedis } from './redis.js'

// Un puerto libre en el que nadie escucha: la conexión es rechazada al instante.
async function closedPort () {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

afterEach(async () => {
  await disconnectRedis()
})

describe('adapter de Redis', () => {
  it('pingRedis devuelve false (sin lanzar) si no hay conexión', async () => {
    await expect(pingRedis()).resolves.toBe(false)
  })

  it('connectRedis lanza sin incluir la URL (puede tener contraseña) y deja pingRedis en false', async () => {
    const url = `redis://:supersecreto@127.0.0.1:${await closedPort()}`

    const err = await connectRedis(url).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('No se pudo conectar a Redis')
    expect(err.message).not.toMatch(/supersecreto/)
    await expect(pingRedis()).resolves.toBe(false)
  })

  it('disconnectRedis es idempotente', async () => {
    await expect(disconnectRedis()).resolves.toBeUndefined()
    await expect(disconnectRedis()).resolves.toBeUndefined()
  })
})
