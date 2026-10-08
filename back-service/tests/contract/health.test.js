// Contrato de GET /internal/health (S1-BE-04): lo usa el health check del ALB interno.
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/adapters/logger.js'
import { createApp } from '../../src/app.js'

const up = async () => true
const down = async () => false

function appWith (health) {
  return createApp({ logger: createLogger({ level: 'silent' }), health })
}

describe('GET /internal/health', () => {
  it('200 si Mongo y Redis responden', async () => {
    const res = await request(appWith({ pingDb: up, pingRedis: up })).get('/internal/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', checks: { mongo: 'up', redis: 'up' } })
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('503 si Mongo no responde', async () => {
    const res = await request(appWith({ pingDb: down, pingRedis: up })).get('/internal/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'unavailable', checks: { mongo: 'down', redis: 'up' } })
  })

  it('503 si Redis no responde', async () => {
    const res = await request(appWith({ pingDb: up, pingRedis: down })).get('/internal/health')

    expect(res.status).toBe(503)
    expect(res.body.checks).toEqual({ mongo: 'up', redis: 'down' })
  })

  it('un ping que lanza cuenta como caído y no filtra el error', async () => {
    const pingDb = async () => { throw new Error('MongoServerSelectionError: connect ECONNREFUSED 10.0.3.12:27017') }
    const res = await request(appWith({ pingDb, pingRedis: up })).get('/internal/health')

    expect(res.status).toBe(503)
    expect(res.body.checks.mongo).toBe('down')
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.3\.12/)
  })

  it('un ping colgado cuenta como caído al vencer el timeout', async () => {
    const hang = () => new Promise(() => {})
    const app = createApp({
      logger: createLogger({ level: 'silent' }),
      health: { pingDb: up, pingRedis: hang, timeoutMs: 50 }
    })
    const res = await request(app).get('/internal/health')

    expect(res.status).toBe(503)
    expect(res.body.checks.redis).toBe('down')
  })

  it('también responde en /health para acceso directo en desarrollo', async () => {
    const res = await request(appWith({ pingDb: up, pingRedis: up })).get('/health')
    expect(res.status).toBe(200)
  })
})
