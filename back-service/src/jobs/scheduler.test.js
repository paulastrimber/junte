import { describe, expect, it, vi } from 'vitest'
import { createRedisLock } from '../adapters/redisLock.js'
import { createScheduler } from './scheduler.js'

const silentLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

/** Redis mínimo en memoria: `SET clave valor PX ttl NX`, con un reloj que maneja el test. */
function fakeRedis () {
  const entries = new Map()
  const redis = {
    status: 'ready',
    now: 0,
    set: vi.fn(async (key, value, _px, ttlMs, _nx) => {
      const current = entries.get(key)
      if (current && current.expiresAt > redis.now) return null
      entries.set(key, { value, expiresAt: redis.now + ttlMs })
      return 'OK'
    })
  }
  return redis
}

const INTERVAL_MS = 60_000

/** Dos instancias del back (dos schedulers) que comparten el mismo Redis y corren el mismo job. */
function twoInstances () {
  const redis = fakeRedis()
  const run = vi.fn(async () => 3)
  const build = () => createScheduler({ jobs: [{ name: 'close-attendance', run }], lock: createRedisLock(() => redis), logger: silentLogger(), intervalMs: INTERVAL_MS })
  return { redis, run, a: build(), b: build() }
}

describe('scheduler con lock', () => {
  it('con dos instancias el job corre una sola vez por ciclo', async () => {
    const { run, a, b } = twoInstances()

    const [first, second] = await Promise.all([a.tick(), b.tick()])

    expect(run).toHaveBeenCalledTimes(1)
    expect([first[0].ran, second[0].ran].sort()).toEqual([false, true])
  })

  it('una instancia con el reloj corrido tampoco lo repite dentro del mismo ciclo', async () => {
    const { redis, run, a, b } = twoInstances()
    await a.tick()
    redis.now = INTERVAL_MS / 2

    await b.tick()

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('en el ciclo siguiente vuelve a correr (el lock venció)', async () => {
    const { redis, run, a, b } = twoInstances()
    await a.tick()
    redis.now = INTERVAL_MS

    await b.tick()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cada job tiene su propio lock: todos corren en el ciclo', async () => {
    const redis = fakeRedis()
    const first = vi.fn(async () => 1)
    const second = vi.fn(async () => 2)
    const scheduler = createScheduler({ jobs: [{ name: 'uno', run: first }, { name: 'dos', run: second }], lock: createRedisLock(() => redis), logger: silentLogger() })

    const results = await scheduler.tick()

    expect(results).toEqual([{ name: 'uno', ran: true, processed: 1 }, { name: 'dos', ran: true, processed: 2 }])
  })

  it('sin Redis no corre el job (nunca sin lock) y lo avisa', async () => {
    const run = vi.fn()
    const logger = silentLogger()
    const scheduler = createScheduler({ jobs: [{ name: 'close-attendance', run }], lock: createRedisLock(() => null), logger })

    const results = await scheduler.tick()

    expect(run).not.toHaveBeenCalled()
    expect(results).toEqual([{ name: 'close-attendance', ran: false }])
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ job: 'close-attendance' }), expect.any(String))
  })

  it('si un job falla, lo loguea y sigue con los demás', async () => {
    const redis = fakeRedis()
    const logger = silentLogger()
    const healthy = vi.fn(async () => 0)
    const failing = vi.fn(async () => { throw new Error('mongo caído') })
    const scheduler = createScheduler({ jobs: [{ name: 'rompe', run: failing }, { name: 'sano', run: healthy }], lock: createRedisLock(() => redis), logger })

    const results = await scheduler.tick()

    expect(results).toEqual([{ name: 'rompe', ran: true, failed: true }, { name: 'sano', ran: true, processed: 0 }])
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ job: 'rompe' }), 'job failed')
  })

  it('loguea inicio y fin con la cantidad procesada y si obtuvo el lock', async () => {
    const logger = silentLogger()
    const scheduler = createScheduler({ jobs: [{ name: 'close-attendance', run: async () => 4 }], lock: createRedisLock(() => fakeRedis()), logger })

    await scheduler.tick()

    expect(logger.info).toHaveBeenCalledWith({ job: 'close-attendance', lockAcquired: true }, 'job started')
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ job: 'close-attendance', processed: 4, durationMs: expect.any(Number) }), 'job finished')
  })

  it('start programa los ciclos y stop los frena esperando al que esté en curso', async () => {
    vi.useFakeTimers()
    try {
      const run = vi.fn(async () => 0)
      const scheduler = createScheduler({ jobs: [{ name: 'close-attendance', run }], lock: createRedisLock(() => fakeRedis()), logger: silentLogger(), intervalMs: 1000, lockTtlMs: 1 })
      scheduler.start()

      await vi.advanceTimersByTimeAsync(1000)
      await scheduler.stop()
      await vi.advanceTimersByTimeAsync(5000)

      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('lock de Redis', () => {
  it('usa SET NX PX con una clave propia del job y un token aleatorio', async () => {
    const redis = fakeRedis()
    const lock = createRedisLock(() => redis)

    const token = await lock.acquire('close-attendance', 54_000)

    expect(token).toEqual(expect.any(String))
    expect(redis.set).toHaveBeenCalledWith('junte:lock:close-attendance', token, 'PX', 54_000, 'NX')
    await expect(lock.acquire('close-attendance', 54_000)).resolves.toBeNull()
  })

  it('lanza si Redis no está listo', async () => {
    const lock = createRedisLock(() => ({ status: 'reconnecting' }))

    await expect(lock.acquire('close-attendance', 1000)).rejects.toThrow('Redis no está disponible')
  })
})
