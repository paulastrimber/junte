// Crea la app Express sin `listen` (la usan server.js y Supertest). Todas las dependencias
// llegan por parámetro desde container.js; los tests pasan fakes.
import express from 'express'
import { errorHandler } from './middlewares/errorHandler.js'
import { createHttpLogger } from './middlewares/httpLogger.js'
import { notFound } from './middlewares/notFound.js'
import { createRequestId } from './middlewares/requestId.js'

const JSON_BODY_LIMIT = '100kb'
// Menor que el timeout del health check del ALB interno: un ping colgado cuenta como caído.
export const HEALTH_CHECK_TIMEOUT_MS = 2000

/**
 * Ejecuta un ping que "nunca lanza", con timeout y por las dudas atrapando cualquier error.
 * @param {() => Promise<boolean>} ping
 * @returns {Promise<boolean>}
 */
async function probe (ping, timeoutMs) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  try {
    return (await Promise.race([Promise.resolve().then(ping), timeout])) === true
  } catch {
    // El contrato dice que ping nunca lanza; si lo hace, el componente se considera caído.
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /internal/health: 200 si Mongo y Redis responden, 503 si alguno no.
 * Solo expone up/down por componente, nunca mensajes de error ni hosts.
 * @param {{ pingDb: () => Promise<boolean>, pingRedis: () => Promise<boolean>, timeoutMs?: number }} deps
 */
function createHealthHandler ({ pingDb, pingRedis, timeoutMs = HEALTH_CHECK_TIMEOUT_MS }) {
  return async function health (req, res) {
    const [mongo, redis] = await Promise.all([probe(pingDb, timeoutMs), probe(pingRedis, timeoutMs)])
    const isHealthy = mongo && redis
    res.set('Cache-Control', 'no-store')
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'unavailable',
      checks: { mongo: mongo ? 'up' : 'down', redis: redis ? 'up' : 'down' }
    })
  }
}

/**
 * @param {object} deps
 * @param {import('pino').Logger} deps.logger
 * @param {{ pingDb: () => Promise<boolean>, pingRedis: () => Promise<boolean>, timeoutMs?: number }} deps.health
 * @param {Array<{ path: string, router: import('express').Router }>} [deps.routes]
 *   Routers de los módulos, montados bajo `/internal` (Nginx reescribe `/api/v1/*` → `/internal/*`).
 * @returns {import('express').Express}
 */
export function createApp ({ logger, health, routes = [] }) {
  const app = express()
  app.disable('x-powered-by')
  // Regla 8: el query string nunca se convierte en objetos anidados (`?a[$gt]=` queda como string).
  app.set('query parser', 'simple')

  // Orden según docs/arquitectura/03-back-service.md#middlewares-orden-en-appjs, salvo que el logger
  // va antes de express.json para que también quede registrada una request con JSON malformado.
  app.use(createRequestId())
  app.use(createHttpLogger({ logger }))
  app.use(express.json({ limit: JSON_BODY_LIMIT }))

  const healthHandler = createHealthHandler(health)
  const internal = express.Router()
  internal.get('/health', healthHandler)
  routes.forEach(({ path, router }) => internal.use(path, router))
  app.use('/internal', internal)

  // Acceso directo al back en desarrollo (en AWS, Nginx responde /health por sí mismo).
  app.get('/health', healthHandler)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
