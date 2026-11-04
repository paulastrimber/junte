// Arma los módulos reales (repos + servicios + routers) con dependencias de test: reloj fijo,
// hasher rápido y storage en memoria. Es el mismo cableado que usa el container de producción.
import { createLogger } from '../../src/adapters/logger.js'
import { createFixedClock } from '../../src/adapters/clock.js'
import { createMemoryPush } from '../../src/adapters/push/index.js'
import { createMemoryStorage } from '../../src/adapters/storage/index.js'
import { createApp } from '../../src/app.js'
import { DEFAULT_FEED_WEIGHTS } from '../../src/config/env.js'
import { buildModules } from '../../src/container.js'
import { createFastHasher } from './fast-hasher.js'

export const TEST_JWT_SECRET = 'a-test-only-secret-with-at-least-32-chars!!'
export const TEST_PASSWORD = 'correct-horse-battery'

/**
 * @param {{ start?: string, maxActiveSessions?: number, feedWeights?: { interests: number, distance: number, schedule: number }, logger?: import('pino').Logger, extraRoutes?: (modules: object) => Array<{ path: string, router: import('express').Router }> }} [options]
 */
export function buildTestModules ({ start = '2026-10-11T15:00:00Z', maxActiveSessions, logger = createLogger({ level: 'silent' }), extraRoutes = () => [], feedWeights = DEFAULT_FEED_WEIGHTS } = {}) {
  const clock = createFixedClock(start)
  const passwordHasher = createFastHasher()
  const storage = createMemoryStorage({ clock })
  // Push en memoria: `push.sent` guarda lo que se habría enviado y `push.invalidTokens` simula tokens rechazados por FCM.
  const push = createMemoryPush()
  const modules = buildModules({
    config: { jwt: { secret: TEST_JWT_SECRET }, feed: { weights: feedWeights } },
    logger,
    clock,
    passwordHasher,
    storage,
    push,
    maxActiveSessions
  })
  const app = createApp({
    logger,
    health: { pingDb: async () => true, pingRedis: async () => true },
    routes: [...modules.routes, ...extraRoutes(modules)]
  })
  return { ...modules, clock, logger, passwordHasher, storage, push, app }
}

/** Registra un usuario por HTTP y devuelve la respuesta del registro. */
let emailCounter = 0
export async function registerViaHttp (request, app, overrides = {}) {
  const res = await request(app).post('/internal/auth/register').send({
    name: 'Ana', email: `user${++emailCounter}@um.edu.uy`, password: TEST_PASSWORD, ...overrides
  })
  if (res.status !== 201) throw new Error(`registro de prueba falló: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}
