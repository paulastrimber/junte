// Contrato de las contraseñas: POST /auth/forgot-password, /auth/reset-password y /auth/change-password.
// El código llega por email (mailer en memoria: `mailer.sent`) y nunca aparece en una respuesta ni en los logs.
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../../src/adapters/logger.js'
import { PasswordReset } from '../../src/modules/auth/password-reset.model.js'
import {
  RESET_CODE_TTL_MS, RESET_MAX_ATTEMPTS, RESET_MAX_REQUESTS_PER_WINDOW, RESET_RESEND_COOLDOWN_MS, RESET_WINDOW_MS
} from '../../src/modules/auth/password.service.js'
import { DeviceToken } from '../../src/modules/devices/device-token.model.js'
import { User } from '../../src/modules/users/user.model.js'
import { useTestDb } from '../helpers/db.js'
import { TEST_PASSWORD, buildTestModules, registerViaHttp } from '../helpers/modules.js'

useTestDb()

const EMAIL = 'ana@um.edu.uy'
const NEW_PASSWORD = 'otra-clave-distinta-9'
const SECOND = 1000

function setup (options) {
  const modules = buildTestModules(options)
  const post = (path, body, token) => {
    const req = request(modules.app).post(`/internal${path}`)
    if (token) req.set('Authorization', `Bearer ${token}`)
    return req.send(body)
  }
  const login = (password, email = EMAIL) => post('/auth/login', { email, password })
  /** El código del último email de recuperación que "salió". */
  const lastCode = () => /\b(\d{6})\b/.exec(modules.mailer.sent.at(-1).text)[1]
  /** Pide un código y lo devuelve. */
  async function requestCode (email = EMAIL) {
    const res = await post('/auth/forgot-password', { email })
    if (res.status !== 202) throw new Error(`forgot-password de prueba falló: ${res.status} ${JSON.stringify(res.body)}`)
    return lastCode()
  }
  return { ...modules, post, login, lastCode, requestCode, signUp: (overrides) => registerViaHttp(request, modules.app, { email: EMAIL, ...overrides }) }
}

function expectError (res, status, code) {
  expect(res.status).toBe(status)
  expect(res.body).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) })
}

const wrongCodeFor = (code) => (code === '000000' ? '000001' : '000000')

describe('POST /auth/forgot-password', () => {
  it('202 sin cuerpo y manda un email con un código de 6 dígitos a esa cuenta', async () => {
    const { post, signUp, mailer } = setup()
    await signUp({ name: 'Ana' })

    const res = await post('/auth/forgot-password', { email: '  ANA@um.edu.uy ' })

    expect(res.status).toBe(202)
    expect(res.text).toBe('')
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: EMAIL, subject: expect.stringContaining('código') })
    expect(mailer.sent[0].text).toMatch(/Hola Ana:[\s\S]*\b\d{6}\b[\s\S]*15 minutos/)
    expect(mailer.sent[0].html).toContain('<p')
  })

  it('guarda solo el HMAC del código, nunca el código', async () => {
    const { requestCode, signUp } = setup()
    await signUp()

    const code = await requestCode()

    const saved = await PasswordReset.findOne().lean()
    expect(saved.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(saved)).not.toContain(code)
    expect(saved).toMatchObject({ attempts: 0, requestCount: 1 })
  })

  it('la misma respuesta para una cuenta que no existe o que está suspendida, y no sale ningún email', async () => {
    const { post, signUp, mailer } = setup()
    const { user } = await signUp()
    await User.updateOne({ _id: user.id }, { $set: { status: 'suspended' } })

    const unknown = await post('/auth/forgot-password', { email: 'nadie@um.edu.uy' })
    const suspended = await post('/auth/forgot-password', { email: EMAIL })

    expect([unknown.status, unknown.text, suspended.status, suspended.text]).toEqual([202, '', 202, ''])
    expect(mailer.sent).toEqual([])
    expect(await PasswordReset.countDocuments()).toBe(0)
  })

  it('un código por minuto: pedir otro enseguida no manda otro email y el anterior sigue valiendo', async () => {
    const { post, requestCode, signUp, mailer, clock } = setup()
    await signUp()
    const first = await requestCode()

    clock.advance(RESET_RESEND_COOLDOWN_MS - SECOND)
    expect((await post('/auth/forgot-password', { email: EMAIL })).status).toBe(202)
    expect(mailer.sent).toHaveLength(1)

    clock.advance(2 * SECOND)
    const second = await requestCode()
    expect(mailer.sent).toHaveLength(2)
    // El nuevo reemplaza al anterior.
    if (second !== first) {
      expectError(await post('/auth/reset-password', { email: EMAIL, code: first, newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')
    }
    expect((await post('/auth/reset-password', { email: EMAIL, code: second, newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it(`como máximo ${RESET_MAX_REQUESTS_PER_WINDOW} códigos por hora por cuenta; después de la hora vuelve a mandar`, async () => {
    const { post, signUp, mailer, clock } = setup()
    await signUp()

    for (let i = 0; i < RESET_MAX_REQUESTS_PER_WINDOW + 2; i++) {
      expect((await post('/auth/forgot-password', { email: EMAIL })).status).toBe(202)
      clock.advance(RESET_RESEND_COOLDOWN_MS + SECOND)
    }
    expect(mailer.sent).toHaveLength(RESET_MAX_REQUESTS_PER_WINDOW)

    clock.advance(RESET_WINDOW_MS)
    await post('/auth/forgot-password', { email: EMAIL })
    expect(mailer.sent).toHaveLength(RESET_MAX_REQUESTS_PER_WINDOW + 1)
    expect((await PasswordReset.findOne().lean()).requestCount).toBe(1)
  })

  it('dos pedidos simultáneos mandan un solo email', async () => {
    const { post, signUp, mailer } = setup()
    await signUp()

    const responses = await Promise.all([1, 2, 3].map(() => post('/auth/forgot-password', { email: EMAIL })))

    expect(responses.map((res) => res.status)).toEqual([202, 202, 202])
    expect(mailer.sent).toHaveLength(1)
    expect(await PasswordReset.countDocuments()).toBe(1)
  })

  it('si el proveedor de email falla, responde 202 igual y no rompe nada', async () => {
    const { post, signUp, mailer } = setup()
    await signUp()
    mailer.failNext()

    expect((await post('/auth/forgot-password', { email: EMAIL })).status).toBe(202)
    expect(mailer.sent).toEqual([])
  })

  it('400 sin email, con un email inválido, con campos de más o con un operador', async () => {
    const { post } = setup()

    for (const body of [{}, { email: 'no-es-un-email' }, { email: EMAIL, userId: 'x' }, { email: { $ne: null } }]) {
      expectError(await post('/auth/forgot-password', body), 400, 'VALIDATION_ERROR')
    }
  })
})

describe('POST /auth/reset-password', () => {
  it('204: la contraseña nueva sirve, la vieja no, y el código no sirve dos veces', async () => {
    const { post, login, requestCode, signUp, mailer } = setup()
    await signUp()
    const code = await requestCode()

    const res = await post('/auth/reset-password', { email: EMAIL, code: ` ${code} `, newPassword: NEW_PASSWORD })

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expectError(await login(TEST_PASSWORD), 401, 'INVALID_CREDENTIALS')
    expect((await login(NEW_PASSWORD)).status).toBe(200)
    expectError(await post('/auth/reset-password', { email: EMAIL, code, newPassword: 'una-tercera-clave-1' }), 401, 'RESET_CODE_INVALID')
    expect(await PasswordReset.countDocuments()).toBe(0)
    // Aviso de que la contraseña cambió, sin la contraseña.
    expect(mailer.sent.at(-1)).toMatchObject({ to: EMAIL, subject: expect.stringContaining('Se cambió la contraseña') })
    expect(JSON.stringify(mailer.sent)).not.toContain(NEW_PASSWORD)
  })

  it('cierra todas las sesiones de la cuenta y borra sus tokens de push', async () => {
    const { post, requestCode, signUp } = setup()
    const phone = await signUp()
    const tablet = (await post('/auth/login', { email: EMAIL, password: TEST_PASSWORD })).body
    await DeviceToken.create({ userId: phone.user.id, token: 'fcm-token-de-prueba', platform: 'android' })

    await post('/auth/reset-password', { email: EMAIL, code: await requestCode(), newPassword: NEW_PASSWORD })

    expectError(await post('/auth/refresh', { refreshToken: phone.refreshToken }), 401, 'UNAUTHENTICATED')
    expectError(await post('/auth/refresh', { refreshToken: tablet.refreshToken }), 401, 'UNAUTHENTICATED')
    await vi.waitFor(async () => expect(await DeviceToken.countDocuments()).toBe(0))
  })

  it('401 RESET_CODE_INVALID con un código incorrecto, y la contraseña no cambia', async () => {
    const { post, login, requestCode, signUp } = setup()
    await signUp()
    const code = await requestCode()

    expectError(await post('/auth/reset-password', { email: EMAIL, code: wrongCodeFor(code), newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')

    expect((await login(TEST_PASSWORD)).status).toBe(200)
    expect((await PasswordReset.findOne().lean()).attempts).toBe(1)
  })

  it(`después de ${RESET_MAX_ATTEMPTS} intentos fallidos ni el código correcto sirve: hay que pedir otro`, async () => {
    const { post, requestCode, signUp, clock } = setup()
    await signUp()
    const code = await requestCode()

    for (let i = 0; i < RESET_MAX_ATTEMPTS; i++) {
      expectError(await post('/auth/reset-password', { email: EMAIL, code: wrongCodeFor(code), newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')
    }
    expectError(await post('/auth/reset-password', { email: EMAIL, code, newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')

    clock.advance(RESET_RESEND_COOLDOWN_MS + SECOND)
    expect((await post('/auth/reset-password', { email: EMAIL, code: await requestCode(), newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it('el código vence a los 15 minutos (un segundo antes todavía sirve)', async () => {
    const expired = setup()
    await expired.signUp()
    const oldCode = await expired.requestCode()
    expired.clock.advance(RESET_CODE_TTL_MS)
    expectError(await expired.post('/auth/reset-password', { email: EMAIL, code: oldCode, newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')

    const { post, requestCode, signUp, clock } = setup()
    await signUp({ email: 'beto@um.edu.uy' })
    const code = await requestCode('beto@um.edu.uy')
    clock.advance(RESET_CODE_TTL_MS - SECOND)
    expect((await post('/auth/reset-password', { email: 'beto@um.edu.uy', code, newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it('el mismo error para una cuenta inexistente, una suspendida y una que nunca pidió un código', async () => {
    const { post, requestCode, signUp } = setup()
    const { user } = await signUp()
    await signUp({ email: 'beto@um.edu.uy' })
    const code = await requestCode()
    await User.updateOne({ _id: user.id }, { $set: { status: 'suspended' } })

    const responses = [
      await post('/auth/reset-password', { email: 'nadie@um.edu.uy', code, newPassword: NEW_PASSWORD }),
      await post('/auth/reset-password', { email: EMAIL, code, newPassword: NEW_PASSWORD }),
      await post('/auth/reset-password', { email: 'beto@um.edu.uy', code, newPassword: NEW_PASSWORD })
    ]

    responses.forEach((res) => expectError(res, 401, 'RESET_CODE_INVALID'))
    expect(new Set(responses.map((res) => res.body.message)).size).toBe(1)
  })

  it('el código de una cuenta no sirve para otra', async () => {
    const { post, requestCode, signUp } = setup()
    await signUp()
    await signUp({ email: 'beto@um.edu.uy' })
    const anaCode = await requestCode()
    await requestCode('beto@um.edu.uy')
    // Aunque los dos códigos coincidieran por azar, el HMAC incluye la cuenta: se fuerza el mismo hash para probarlo.
    const ana = await PasswordReset.findOne({ userId: (await User.findOne({ email: EMAIL }))._id }).lean()
    await PasswordReset.updateOne({ userId: (await User.findOne({ email: 'beto@um.edu.uy' }))._id }, { $set: { codeHash: ana.codeHash } })

    expectError(await post('/auth/reset-password', { email: 'beto@um.edu.uy', code: anaCode, newPassword: NEW_PASSWORD }), 401, 'RESET_CODE_INVALID')
  })

  it('con el código correcto dos veces a la vez, solo una cambia la contraseña', async () => {
    const { post, requestCode, signUp } = setup()
    await signUp()
    const code = await requestCode()

    const responses = await Promise.all(['clave-de-la-primera-1', 'clave-de-la-segunda-2']
      .map((newPassword) => post('/auth/reset-password', { email: EMAIL, code, newPassword })))

    expect(responses.map((res) => res.status).sort()).toEqual([204, 401])
  })

  it('400 con un código mal formado, una contraseña corta o larga, campos de más u operadores; no gasta intentos', async () => {
    const { post, requestCode, signUp } = setup()
    await signUp()
    const code = await requestCode()
    const valid = { email: EMAIL, code, newPassword: NEW_PASSWORD }

    for (const body of [
      { ...valid, code: '12345' },
      { ...valid, code: '1234567' },
      { ...valid, code: 'abcdef' },
      { ...valid, code: { $ne: null } },
      { ...valid, newPassword: 'corta' },
      { ...valid, newPassword: 'x'.repeat(129) },
      { ...valid, userId: 'x' },
      { email: EMAIL, code }
    ]) {
      expectError(await post('/auth/reset-password', body), 400, 'VALIDATION_ERROR')
    }
    expect((await PasswordReset.findOne().lean()).attempts).toBe(0)
  })
})

describe('POST /auth/change-password', () => {
  it('204: cambia la contraseña, cierra las demás sesiones y deja abierta la que hizo el cambio', async () => {
    const { post, login, signUp, mailer } = setup()
    const phone = await signUp()
    const tablet = (await post('/auth/login', { email: EMAIL, password: TEST_PASSWORD })).body

    const res = await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, phone.accessToken)

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect((await login(NEW_PASSWORD)).status).toBe(200)
    expectError(await login(TEST_PASSWORD), 401, 'INVALID_CREDENTIALS')
    expectError(await post('/auth/refresh', { refreshToken: tablet.refreshToken }), 401, 'UNAUTHENTICATED')
    expect((await post('/auth/refresh', { refreshToken: phone.refreshToken })).status).toBe(200)
    expect(mailer.sent.at(-1)).toMatchObject({ to: EMAIL, subject: expect.stringContaining('Se cambió la contraseña') })
  })

  it('400 con el detalle en currentPassword si la contraseña actual no es correcta, y no cambia nada', async () => {
    const { post, login, signUp, mailer } = setup()
    const { accessToken, refreshToken } = await signUp()

    const res = await post('/auth/change-password', { currentPassword: 'no-es-la-actual', newPassword: NEW_PASSWORD }, accessToken)

    expectError(res, 400, 'VALIDATION_ERROR')
    expect(res.body.details).toEqual([{ path: 'currentPassword', message: 'La contraseña actual no es correcta' }])
    expect((await login(TEST_PASSWORD)).status).toBe(200)
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(200)
    expect(mailer.sent).toEqual([])
  })

  it('400 si la nueva es igual a la actual, es corta, o vienen campos de más', async () => {
    const { post, signUp } = setup()
    const { accessToken, user } = await signUp()

    const same = await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD }, accessToken)
    expectError(same, 400, 'VALIDATION_ERROR')
    expect(same.body.details).toEqual([expect.objectContaining({ path: 'newPassword' })])
    expectError(await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'corta' }, accessToken), 400, 'VALIDATION_ERROR')
    expectError(await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, userId: user.id }, accessToken), 400, 'VALIDATION_ERROR')
    expectError(await post('/auth/change-password', { newPassword: NEW_PASSWORD }, accessToken), 400, 'VALIDATION_ERROR')
  })

  it('401 sin token: la identidad sale del token, no del body', async () => {
    const { post, signUp } = setup()
    await signUp()

    expectError(await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }), 401, 'UNAUTHENTICATED')
  })

  it('un código de recuperación pendiente deja de servir después de cambiar la contraseña', async () => {
    const { post, requestCode, signUp } = setup()
    const { accessToken } = await signUp()
    const code = await requestCode()

    await post('/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, accessToken)

    expectError(await post('/auth/reset-password', { email: EMAIL, code, newPassword: 'una-tercera-clave-1' }), 401, 'RESET_CODE_INVALID')
  })
})

describe('logs', () => {
  it('nunca llevan el código, las contraseñas ni el email', async () => {
    const lines = []
    const logger = createLogger({ level: 'info', destination: { write: (line) => lines.push(line) } })
    const { post, requestCode, signUp } = setup({ logger })
    const { accessToken } = await signUp()
    const code = await requestCode()

    await post('/auth/reset-password', { email: EMAIL, code: wrongCodeFor(code), newPassword: NEW_PASSWORD })
    await post('/auth/reset-password', { email: EMAIL, code, newPassword: NEW_PASSWORD })
    await post('/auth/change-password', { currentPassword: 'no-es-la-actual', newPassword: 'una-tercera-clave-1' }, accessToken)

    const output = lines.join('')
    expect(output).toContain('"event":"password.reset_requested"')
    expect(output).toContain('"event":"password.reset_rejected"')
    expect(output).toContain('"event":"password.reset"')
    for (const secret of [code, NEW_PASSWORD, TEST_PASSWORD, 'no-es-la-actual', 'una-tercera-clave-1', EMAIL]) {
      expect(output).not.toContain(secret)
    }
  })
})

describe('enrutado estricto (no se esquiva el límite de Nginx con una variante de la URL)', () => {
  it.each(['/internal/auth/Forgot-Password', '/internal/auth/forgot-password/', '/internal/auth/RESET-PASSWORD', '/internal/auth/reset-password/', '/internal/auth/change-password/'])(
    '%s → 404', async (path) => {
      const { app } = setup()

      expectError(await request(app).post(path).send({ email: EMAIL }), 404, 'NOT_FOUND')
    })
})
