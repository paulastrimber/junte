// Contrato HTTP de POST /uploads/presign (S2-BE-09).
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { buildTestModules, registerViaHttp } from '../helpers/modules.js'

useTestDb()

function setup () {
  const modules = buildTestModules()
  const presign = (token, body) => {
    const req = request(modules.app).post('/internal/uploads/presign')
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body)
  }
  return { ...modules, presign, signUp: (overrides) => registerViaHttp(request, modules.app, overrides) }
}

describe('POST /uploads/presign', () => {
  it('200 con url, objectKey bajo users/<userId>/ y vencimiento de 5 minutos', async () => {
    const { presign, signUp } = setup()
    const { accessToken, user } = await signUp()

    const res = await presign(accessToken, { contentType: 'image/png', sizeBytes: 123456 })

    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'objectKey', 'url'])
    expect(res.body.objectKey).toMatch(new RegExp(`^users/${user.id}/[0-9a-f-]{36}\\.png$`))
    expect(res.body.url).toContain(res.body.objectKey)
    expect(res.body.expiresAt).toBe('2026-10-11T15:05:00.000Z')
  })

  it.each([
    ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']
  ])('acepta %s con extensión .%s', async (contentType, extension) => {
    const { presign, signUp } = setup()
    const { accessToken } = await signUp()

    const res = await presign(accessToken, { contentType, sizeBytes: 1000 })

    expect(res.body.objectKey.endsWith(`.${extension}`)).toBe(true)
  })

  it('cada llamada genera una clave distinta', async () => {
    const { presign, signUp } = setup()
    const { accessToken } = await signUp()

    const first = await presign(accessToken, { contentType: 'image/jpeg', sizeBytes: 1000 })
    const second = await presign(accessToken, { contentType: 'image/jpeg', sizeBytes: 1000 })

    expect(first.body.objectKey).not.toBe(second.body.objectKey)
  })

  it('acepta exactamente 5 MB', async () => {
    const { presign, signUp } = setup()
    const { accessToken } = await signUp()

    expect((await presign(accessToken, { contentType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 })).status).toBe(200)
  })

  it.each([
    ['tipo fuera de la lista (gif)', { contentType: 'image/gif', sizeBytes: 1000 }],
    ['tipo ejecutable', { contentType: 'text/html', sizeBytes: 1000 }],
    ['sin tipo', { sizeBytes: 1000 }],
    ['sin tamaño', { contentType: 'image/jpeg' }],
    ['tamaño 0', { contentType: 'image/jpeg', sizeBytes: 0 }],
    ['tamaño negativo', { contentType: 'image/jpeg', sizeBytes: -5 }],
    ['tamaño decimal', { contentType: 'image/jpeg', sizeBytes: 10.5 }],
    ['tamaño como texto', { contentType: 'image/jpeg', sizeBytes: '1000' }],
    ['más de 5 MB', { contentType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 + 1 }],
    ['el cliente intenta elegir la clave', { contentType: 'image/jpeg', sizeBytes: 1000, objectKey: 'users/otro/x.jpg' }],
    ['planId que no es un id (el flujo con planId está en plans.test.js)', { contentType: 'image/jpeg', sizeBytes: 1000, planId: '../users' }],
    ['operador de Mongo', { contentType: { $ne: null }, sizeBytes: 1000 }]
  ])('400 VALIDATION_ERROR: %s', async (_label, body) => {
    const { presign, signUp } = setup()
    const { accessToken } = await signUp()

    const res = await presign(accessToken, body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('401 sin token', async () => {
    const { presign } = setup()

    const res = await presign(null, { contentType: 'image/jpeg', sizeBytes: 1000 })

    expect(res.status).toBe(401)
  })
})
