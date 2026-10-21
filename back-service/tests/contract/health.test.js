// Contrato de GET /internal/health (S1-BE-04): lo usa el health check del ALB interno.
// El código HTTP depende solo de MongoDB; Redis se informa en checks (ver docs/pendientes.md).
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

  // Si Redis cae, la API sigue sirviendo (el chat pasa a polling): el ALB interno no debe sacar
  // a las instancias, así que el código sigue siendo 200 y Redis se informa como degradado.
  it('200 degradado si Redis no responde', async () => {
    const res = await request(appWith({ pingDb: up, pingRedis: down })).get('/internal/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'degraded', checks: { mongo: 'up', redis: 'down' } })
  })

  it('503 si no responde ninguno', async () => {
    const res = await request(appWith({ pingDb: down, pingRedis: down })).get('/internal/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'unavailable', checks: { mongo: 'down', redis: 'down' } })
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
    const appWithHang = (health) => createApp({ logger: createLogger({ level: 'silent' }), health: { ...health, timeoutMs: 50 } })

    const mongoHangs = await request(appWithHang({ pingDb: hang, pingRedis: up })).get('/internal/health')
    expect(mongoHangs.status).toBe(503)
    expect(mongoHangs.body.checks.mongo).toBe('down')

    const redisHangs = await request(appWithHang({ pingDb: up, pingRedis: hang })).get('/internal/health')
    expect(redisHangs.status).toBe(200)
    expect(redisHangs.body).toEqual({ status: 'degraded', checks: { mongo: 'up', redis: 'down' } })
  })

  it('también responde en /health para acceso directo en desarrollo', async () => {
    const res = await request(appWith({ pingDb: up, pingRedis: up })).get('/health')
    expect(res.status).toBe(200)
  })
})
