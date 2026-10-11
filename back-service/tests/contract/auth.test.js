// Contrato HTTP de /auth y de los middlewares authenticate / requireRole (S2-BE-03 a S2-BE-07).
import express from 'express'
import { SignJWT } from 'jose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { requireRole } from '../../src/middlewares/requireRole.js'
import { Session } from '../../src/modules/auth/session.model.js'
import { User } from '../../src/modules/users/user.model.js'
import { useTestDb } from '../helpers/db.js'
import { TEST_JWT_SECRET, TEST_PASSWORD, buildTestModules, registerViaHttp } from '../helpers/modules.js'

useTestDb()

// Rutas de prueba que ejercitan authenticate y requireRole.
function protectedRoutes ({ authenticate }) {
  const router = express.Router()
  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }))
  router.get('/admin', authenticate, requireRole('admin'), (req, res) => res.json({ ok: true }))
  return [{ path: '/test', router }]
}

function setup (options) {
  const modules = buildTestModules({ extraRoutes: protectedRoutes, ...options })
  const post = (path, body, token) => {
    const req = request(modules.app).post(`/internal${path}`)
    if (token) req.set('Authorization', `Bearer ${token}`)
    return req.send(body)
  }
  const get = (path, token) => {
    const req = request(modules.app).get(`/internal${path}`)
    return token ? req.set('Authorization', `Bearer ${token}`) : req
  }
  return { ...modules, post, get, signUp: (overrides) => registerViaHttp(request, modules.app, overrides) }
}

function expectError (res, status, code) {
  expect(res.status).toBe(status)
  expect(Object.keys(res.body).filter((k) => k !== 'details').sort()).toEqual(['code', 'message', 'requestId'])
  expect(res.body.code).toBe(code)
  expect(res.body.requestId).toBe(res.headers['x-request-id'])
}

describe('POST /auth/register', () => {
  it('201 con el usuario serializado y los dos tokens, sin hashes ni datos de sesión', async () => {
    const { post } = setup()

    const res = await post('/auth/register', { name: '  Ana ', email: ' Ana@UM.edu.uy ', password: TEST_PASSWORD })

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({
      email: 'ana@um.edu.uy',
      name: 'Ana',
      interests: [],
      birthDate: null,
      age: null,
      university: null,
      career: null,
      city: null,
      neighborhood: null,
      photoUrl: null,
      profileComplete: false,
      onboardingCompleted: false,
      reputation: 0
    })
    expect(res.body.accessToken).toEqual(expect.any(String))
    expect(res.body.refreshToken).toEqual(expect.any(String))
    const raw = JSON.stringify(res.body.user)
    expect(raw).not.toMatch(/passwordHash|refreshTokenHash|sid|session|role|status|photoKey/i)
    expect(raw).not.toContain(TEST_PASSWORD)
  })

  it('409 EMAIL_TAKEN con el mismo email aunque cambien mayúsculas y espacios', async () => {
    const { post } = setup()
    await post('/auth/register', { name: 'Ana', email: 'ana@um.edu.uy', password: TEST_PASSWORD })

    const res = await post('/auth/register', { name: 'Otra', email: '  ANA@um.edu.uy  ', password: TEST_PASSWORD })

    expectError(res, 409, 'EMAIL_TAKEN')
  })

  it.each([
    ['sin name', { name: undefined }],
    ['sin email', { email: undefined }],
    ['email inválido', { email: 'no-es-un-email' }],
    ['contraseña de 7 caracteres', { password: '1234567' }],
    ['contraseña enorme', { password: 'x'.repeat(129) }],
    ['operador de Mongo en el email', { email: { $ne: null } }],
    ['operador de Mongo en el name', { name: { $gt: '' } }],
    ['name como arreglo', { name: ['a'] }]
  ])('400 VALIDATION_ERROR: %s', async (_label, override) => {
    const { post } = setup()

    const res = await post('/auth/register', { name: 'Ana', email: 'ana@um.edu.uy', password: TEST_PASSWORD, ...override })

    expectError(res, 400, 'VALIDATION_ERROR')
    expect(res.body.details.length).toBeGreaterThan(0)
  })

  it.each([
    ['role', 'admin'], ['status', 'suspended'], ['reputation', 50], ['age', 30], ['birthDate', '2000-01-01'],
    ['passwordHash', 'x'], ['id', '665f1c2a9b1e8a0012345678'], ['photoKey', 'users/x/y.jpg'],
    // El perfil (universidad, carrera, ciudad, intereses…) se completa después, en el onboarding.
    ['university', 'um'], ['career', 'economia'], ['city', 'montevideo'], ['neighborhood', 'pocitos'], ['interests', ['futbol']]
  ])('400 si el body trae el campo no permitido %s (.strict)', async (field, value) => {
    const { post } = setup()

    const res = await post('/auth/register', { name: 'Ana', email: 'ana@um.edu.uy', password: TEST_PASSWORD, [field]: value })

    expectError(res, 400, 'VALIDATION_ERROR')
    expect(await User.countDocuments()).toBe(0)
  })

  it('los details y mensajes salen en español y no repiten la contraseña', async () => {
    const { post } = setup()

    const res = await post('/auth/register', { name: 'Ana', email: 'ana@um.edu.uy', password: 'corta' })

    expect(JSON.stringify(res.body)).not.toContain('corta')
    expect(res.body.details[0]).toMatchObject({ path: 'password', message: expect.stringMatching(/caracteres/) })
  })
})

describe('POST /auth/login', () => {
  it('200 con usuario y tokens', async () => {
    const { post, signUp } = setup()
    await signUp({ email: 'ana@um.edu.uy' })

    const res = await post('/auth/login', { email: 'ANA@um.edu.uy', password: TEST_PASSWORD, deviceLabel: 'android' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ user: { email: 'ana@um.edu.uy' }, accessToken: expect.any(String), refreshToken: expect.any(String) })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/)
  })

  it('el mismo error 401 para contraseña incorrecta y para email inexistente', async () => {
    const { post, signUp } = setup()
    await signUp({ email: 'ana@um.edu.uy' })

    const wrongPassword = await post('/auth/login', { email: 'ana@um.edu.uy', password: 'incorrecta-123' })
    const unknown = await post('/auth/login', { email: 'nadie@um.edu.uy', password: 'incorrecta-123' })

    expectError(wrongPassword, 401, 'INVALID_CREDENTIALS')
    expectError(unknown, 401, 'INVALID_CREDENTIALS')
    expect(unknown.body.message).toBe(wrongPassword.body.message)
  })

  it('un hash con formato inválido responde 401, no 500', async () => {
    const { post } = setup()
    await User.create({ email: 'seed@junte.test', passwordHash: '!seed-no-login', name: 'Seed' })

    expectError(await post('/auth/login', { email: 'seed@junte.test', password: TEST_PASSWORD }), 401, 'INVALID_CREDENTIALS')
  })

  it('usuario suspendido → 401 ACCOUNT_SUSPENDED', async () => {
    const { post, signUp } = setup()
    const { user } = await signUp({ email: 'ana@um.edu.uy' })
    await User.updateOne({ _id: user.id }, { status: 'suspended' })

    expectError(await post('/auth/login', { email: 'ana@um.edu.uy', password: TEST_PASSWORD }), 401, 'ACCOUNT_SUSPENDED')
  })

  it('inyección NoSQL: un operador en el email o la contraseña es 400 y no loguea a nadie', async () => {
    const { post, signUp } = setup()
    await signUp({ email: 'ana@um.edu.uy' })

    expectError(await post('/auth/login', { email: { $ne: null }, password: TEST_PASSWORD }), 400, 'VALIDATION_ERROR')
    expectError(await post('/auth/login', { email: 'ana@um.edu.uy', password: { $ne: null } }), 400, 'VALIDATION_ERROR')
  })

  it('400 con campos desconocidos', async () => {
    const { post } = setup()

    expectError(await post('/auth/login', { email: 'ana@um.edu.uy', password: 'x', role: 'admin' }), 400, 'VALIDATION_ERROR')
  })
})

describe('enrutado estricto en /auth (no se esquiva el límite de Nginx con una variante de la URL)', () => {
  it.each(['/internal/auth/LOGIN', '/internal/auth/Login', '/internal/auth/login/', '/internal/AUTH/login', '/internal/auth/REGISTER', '/internal/auth/register/'])(
    '%s → 404', async (path) => {
      const { app } = setup()

      const res = await request(app).post(path).send({ email: 'ana@um.edu.uy', password: TEST_PASSWORD, name: 'Ana' })

      expectError(res, 404, 'NOT_FOUND')
    })
})

describe('POST /auth/refresh', () => {
  it('200 con un par nuevo; el refresh viejo ya no sirve y la sesión queda revocada (401)', async () => {
    const { post, signUp } = setup()
    const first = await signUp()

    const rotated = await post('/auth/refresh', { refreshToken: first.refreshToken })
    expect(rotated.status).toBe(200)
    expect(Object.keys(rotated.body).sort()).toEqual(['accessToken', 'refreshToken'])

    const reuse = await post('/auth/refresh', { refreshToken: first.refreshToken })
    expectError(reuse, 401, 'UNAUTHENTICATED')

    const afterRevocation = await post('/auth/refresh', { refreshToken: rotated.body.refreshToken })
    expectError(afterRevocation, 401, 'UNAUTHENTICATED')
    expect(await Session.countDocuments({ revokedAt: { $ne: null } })).toBe(1)
  })

  it('400 sin refreshToken o con otro tipo de valor', async () => {
    const { post } = setup()

    expectError(await post('/auth/refresh', {}), 400, 'VALIDATION_ERROR')
    expectError(await post('/auth/refresh', { refreshToken: { $ne: null } }), 400, 'VALIDATION_ERROR')
  })

  it('401 con un access token en lugar del refresh', async () => {
    const { post, signUp } = setup()
    const { accessToken } = await signUp()

    expectError(await post('/auth/refresh', { refreshToken: accessToken }), 401, 'UNAUTHENTICATED')
  })

  it('401 UNAUTHENTICATED (no TOKEN_EXPIRED) con un refresh vencido', async () => {
    const { post, signUp, clock } = setup()
    const { refreshToken } = await signUp()

    clock.advance(31 * 24 * 60 * 60 * 1000)

    expectError(await post('/auth/refresh', { refreshToken }), 401, 'UNAUTHENTICATED')
  })
})

describe('POST /auth/logout y /auth/logout-all', () => {
  it('logout: 204 y cierra solo la sesión del access token', async () => {
    const { post, signUp } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = (await post('/auth/login', { email: 'ana@um.edu.uy', password: TEST_PASSWORD })).body

    const res = await post('/auth/logout', undefined, phone.accessToken)

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'UNAUTHENTICATED')
    expect((await post('/auth/refresh', { refreshToken: tablet.refreshToken })).status).toBe(200)
  })

  it('logout-all: 204 y cierra todas las sesiones', async () => {
    const { post, signUp } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = (await post('/auth/login', { email: 'ana@um.edu.uy', password: TEST_PASSWORD })).body

    const res = await post('/auth/logout-all', undefined, phone.accessToken)

    expect(res.status).toBe(204)
    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'UNAUTHENTICATED')
    expectError(await post('/auth/refresh', { refreshToken: tablet.refreshToken }), 401, 'UNAUTHENTICATED')
  })

  it.each(['/auth/logout', '/auth/logout-all'])('%s requiere access token (401)', async (path) => {
    const { post } = setup()

    expectError(await post(path, {}), 401, 'UNAUTHENTICATED')
  })
})

describe('authenticate', () => {
  it('sin header Authorization → 401 UNAUTHENTICATED', async () => {
    const { get } = setup()

    expectError(await get('/test/me'), 401, 'UNAUTHENTICATED')
  })

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'bearer a b', 'Token abc', 'Bearer a.b.c'])('header mal formado (%j) → 401', async (header) => {
    const { app } = setup()

    const res = await request(app).get('/internal/test/me').set('Authorization', header)

    expectError(res, 401, 'UNAUTHENTICATED')
  })

  it('token válido → 200 y req.user con id y rol (nunca el hash)', async () => {
    const { get, signUp } = setup()
    const { accessToken, user } = await signUp()

    const res = await get('/test/me', accessToken)

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ id: user.id, role: 'user' })
  })

  it('token vencido → 401 TOKEN_EXPIRED', async () => {
    const { get, signUp, clock } = setup()
    const { accessToken } = await signUp()

    clock.advance(16 * 60 * 1000)

    expectError(await get('/test/me', accessToken), 401, 'TOKEN_EXPIRED')
  })

  it('un refresh token usado como access → 401', async () => {
    const { get, signUp } = setup()
    const { refreshToken } = await signUp()

    expectError(await get('/test/me', refreshToken), 401, 'UNAUTHENTICATED')
  })

  it('firmado con otro algoritmo (HS512) → 401', async () => {
    const { get, signUp, clock } = setup()
    const { user } = await signUp()
    const iat = Math.floor(clock.now().getTime() / 1000)
    const token = await new SignJWT({ typ: 'access', sid: 's' })
      .setProtectedHeader({ alg: 'HS512' }).setSubject(user.id).setIssuedAt(iat).setExpirationTime(iat + 600)
      .sign(new TextEncoder().encode(TEST_JWT_SECRET))

    expectError(await get('/test/me', token), 401, 'UNAUTHENTICATED')
  })

  it('alg none → 401', async () => {
    const { get, signUp, clock } = setup()
    const { user } = await signUp()
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const iat = Math.floor(clock.now().getTime() / 1000)
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, typ: 'access', sid: 's', iat, exp: iat + 600 })}.`

    expectError(await get('/test/me', token), 401, 'UNAUTHENTICATED')
  })

  it('usuario suspendido con token vigente → 401', async () => {
    const { get, signUp } = setup()
    const { accessToken, user } = await signUp()
    await User.updateOne({ _id: user.id }, { status: 'suspended' })

    expectError(await get('/test/me', accessToken), 401, 'ACCOUNT_SUSPENDED')
  })

  it('usuario borrado con token vigente → 401', async () => {
    const { get, signUp } = setup()
    const { accessToken, user } = await signUp()
    await User.deleteOne({ _id: user.id })

    expectError(await get('/test/me', accessToken), 401, 'UNAUTHENTICATED')
  })
})

describe('requireRole', () => {
  it('un usuario sin rol admin → 403 FORBIDDEN', async () => {
    const { get, signUp } = setup()
    const { accessToken } = await signUp()

    expectError(await get('/test/admin', accessToken), 403, 'FORBIDDEN')
  })

  it('un admin → 200, y el cambio de rol vale en el acto (el rol no viaja en el token)', async () => {
    const { get, signUp } = setup()
    const { accessToken, user } = await signUp()
    await User.updateOne({ _id: user.id }, { role: 'admin' })

    expect((await get('/test/admin', accessToken)).status).toBe(200)
  })

  it('sin token → 401 (antes que 403)', async () => {
    const { get } = setup()

    expectError(await get('/test/admin'), 401, 'UNAUTHENTICATED')
  })
})
