// Contrato HTTP base (S1-BE-03): formato de error, requestId, JSON malformado, errores no previstos y logs.
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createLogger } from '../../src/adapters/logger.js'
import { createApp } from '../../src/app.js'
import { AppError } from '../../src/shared/errors.js'

const healthyDeps = { pingDb: async () => true, pingRedis: async () => true }

function captureLogs () {
  const lines = []
  const logger = createLogger({ level: 'info', destination: { write: (line) => lines.push(JSON.parse(line)) } })
  return { logger, lines }
}

function buildApp ({ logger = createLogger({ level: 'silent' }), routes = [] } = {}) {
  return createApp({ logger, health: healthyDeps, routes })
}

// Rutas de prueba montadas bajo /internal/test para ejercitar el errorHandler.
function testRoutes () {
  const router = express.Router()
  router.post('/echo', (req, res) => res.status(201).json({ received: req.body }))
  router.get('/app-error', () => { throw new AppError('PLAN_FULL', 'El plan no tiene cupos disponibles') })
  router.get('/zod-error', () => { z.object({ capacity: z.number().int().positive() }).parse({ capacity: -1 }) })
  router.get('/boom', async () => { throw new Error('E11000 duplicate key error collection: junte.users') })
  router.get('/items/:id', (req, res) => res.json({ id: req.params.id }))
  return [{ path: '/test', router }]
}

function expectErrorShape (body, code) {
  expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId'])
  expect(body.code).toBe(code)
  expect(typeof body.message).toBe('string')
  expect(body.message.length).toBeGreaterThan(0)
  expect(typeof body.requestId).toBe('string')
}

describe('ruta inexistente', () => {
  it('responde 404 con { code: NOT_FOUND, message, requestId } y sin stack', async () => {
    const res = await request(buildApp()).get('/internal/no-existe')

    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expectErrorShape(res.body, 'NOT_FOUND')
    expect(res.body.requestId).toBe(res.headers['x-request-id'])
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.js/)
  })

  it('también fuera de /internal', async () => {
    const res = await request(buildApp()).post('/api/v1/plans').send({})
    expect(res.status).toBe(404)
    expectErrorShape(res.body, 'NOT_FOUND')
  })
})

describe('enrutado estricto', () => {
  it.each(['/internal/HEALTH', '/internal/Health', '/internal/health/'])('%s no es /internal/health (404)', async (path) => {
    const res = await request(buildApp()).get(path)

    expect(res.status).toBe(404)
    expectErrorShape(res.body, 'NOT_FOUND')
  })
})

describe('X-Request-Id', () => {
  it('propaga el que manda Nginx al header de respuesta y al cuerpo del error', async () => {
    const res = await request(buildApp()).get('/internal/no-existe').set('X-Request-Id', 'abc123-nginx')

    expect(res.headers['x-request-id']).toBe('abc123-nginx')
    expect(res.body.requestId).toBe('abc123-nginx')
  })

  it('genera uno si falta', async () => {
    const res = await request(buildApp()).get('/internal/health')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reemplaza un valor inválido en lugar de copiarlo a los logs', async () => {
    const res = await request(buildApp()).get('/internal/health').set('X-Request-Id', 'a b{"x":1}')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('cuerpo JSON', () => {
  it('JSON malformado → 400 VALIDATION_ERROR sin detalles del parser', async () => {
    const res = await request(buildApp({ routes: testRoutes() }))
      .post('/internal/test/echo')
      .set('Content-Type', 'application/json')
      .send('{"title": "asado",')

    expect(res.status).toBe(400)
    expectErrorShape(res.body, 'VALIDATION_ERROR')
    expect(res.body.message).not.toMatch(/Unexpected|position|JSON\.parse/)
  })

  it('cuerpo mayor a 100kb → 413 VALIDATION_ERROR', async () => {
    const res = await request(buildApp({ routes: testRoutes() }))
      .post('/internal/test/echo')
      .send({ text: 'x'.repeat(110 * 1024) })

    expect(res.status).toBe(413)
    expectErrorShape(res.body, 'VALIDATION_ERROR')
  })

  it('JSON válido llega parseado a la ruta', async () => {
    const res = await request(buildApp({ routes: testRoutes() })).post('/internal/test/echo').send({ a: 1 })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ received: { a: 1 } })
  })
})

describe('errorHandler', () => {
  it('AppError → status y code del catálogo', async () => {
    const res = await request(buildApp({ routes: testRoutes() })).get('/internal/test/app-error')
    expect(res.status).toBe(409)
    expectErrorShape(res.body, 'PLAN_FULL')
    expect(res.body.message).toBe('El plan no tiene cupos disponibles')
  })

  it('ZodError → 400 VALIDATION_ERROR con details por campo', async () => {
    const res = await request(buildApp({ routes: testRoutes() })).get('/internal/test/zod-error')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.details).toEqual([{ path: 'capacity', message: expect.any(String) }])
  })

  it('error no previsto → 500 INTERNAL sin mensaje interno ni stack', async () => {
    const res = await request(buildApp({ routes: testRoutes() })).get('/internal/test/boom')
    expect(res.status).toBe(500)
    expectErrorShape(res.body, 'INTERNAL')
    expect(JSON.stringify(res.body)).not.toMatch(/E11000|junte\.users|stack/)
  })

  it('el query string no se convierte en objetos (no llegan operadores de Mongo)', async () => {
    const router = express.Router()
    router.get('/', (req, res) => res.json({ query: req.query }))
    const app = buildApp({ routes: [{ path: '/q', router }] })

    const res = await request(app).get('/internal/q?status[$ne]=closed')
    expect(res.body.query).toEqual({ 'status[$ne]': 'closed' })
  })
})

describe('httpLogger', () => {
  it('una línea por request con requestId, método, patrón de ruta, status y duración', async () => {
    const { logger, lines } = captureLogs()
    await request(buildApp({ logger, routes: testRoutes() }))
      .get('/internal/test/items/665f1c2a9b1e8a0012345678?lat=-34.9&lng=-56.1')
      .set('X-Request-Id', 'req-1')
      .set('Authorization', 'Bearer secreto.jwt.token')

    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line).toMatchObject({
      level: 30,
      requestId: 'req-1',
      method: 'GET',
      route: '/internal/test/items/:id',
      status: 200,
      durationMs: expect.any(Number)
    })
    const raw = JSON.stringify(line)
    expect(raw).not.toMatch(/secreto|Bearer|-34\.9|-56\.1|665f1c2a9b1e8a0012345678/)
  })

  it('no loguea el body de la request', async () => {
    const { logger, lines } = captureLogs()
    await request(buildApp({ logger, routes: testRoutes() }))
      .post('/internal/test/echo')
      .send({ email: 'ana@um.edu.uy', password: 'hunter2hunter2' })

    expect(JSON.stringify(lines)).not.toMatch(/hunter2|ana@um/)
  })

  it('un 500 se loguea como error con el stack (que no va en la respuesta)', async () => {
    const { logger, lines } = captureLogs()
    await request(buildApp({ logger, routes: testRoutes() })).get('/internal/test/boom')

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 50, status: 500, route: '/internal/test/boom' })
    expect(lines[0].err.stack).toMatch(/E11000/)
  })

  it('una ruta inexistente se loguea con el path sin query string', async () => {
    const { logger, lines } = captureLogs()
    await request(buildApp({ logger })).get('/internal/nada?lat=-34.9')

    expect(lines[0]).toMatchObject({ status: 404, route: null, path: '/internal/nada' })
    expect(JSON.stringify(lines[0])).not.toMatch(/-34\.9/)
  })
})
