// Reglas de negocio de auth contra repositorios reales (Mongo en memoria), sin HTTP.
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { TEST_PASSWORD, buildTestModules } from '../helpers/modules.js'
import { Session } from '../../src/modules/auth/session.model.js'
import { User } from '../../src/modules/users/user.model.js'

useTestDb()

const DAY_MS = 24 * 60 * 60 * 1000
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

function setup (options) {
  const modules = buildTestModules(options)
  let counter = 0
  const signUp = (overrides = {}) => modules.authService.register({
    name: 'Ana', email: `ana${++counter}@um.edu.uy`, password: TEST_PASSWORD, ...overrides
  })
  return { ...modules, signUp }
}

describe('register', () => {
  it('crea el usuario con la contraseña hasheada y abre una sesión', async () => {
    const { signUp, passwordHasher } = setup()

    const { user, accessToken, refreshToken } = await signUp({ email: 'ana@um.edu.uy' })

    expect(user).toMatchObject({ email: 'ana@um.edu.uy', name: 'Ana', interests: [], role: 'user', status: 'active' })
    expect(user.passwordHash).not.toContain(TEST_PASSWORD)
    expect(await passwordHasher.verify(user.passwordHash, TEST_PASSWORD)).toBe(true)
    expect(accessToken).toEqual(expect.any(String))
    expect(refreshToken).toEqual(expect.any(String))
    expect(await Session.countDocuments({ userId: user.id })).toBe(1)
  })

  it('el registro solo guarda lo básico: el resto del perfil se completa en el onboarding', async () => {
    const { signUp } = setup()

    const { user } = await signUp({ email: 'ana@um.edu.uy' })

    for (const field of ['birthDate', 'university', 'career', 'city', 'neighborhood', 'photoKey', 'onboardingCompletedAt']) {
      expect(user[field], field).toBeUndefined()
    }
    expect(user.interests).toEqual([])
  })

  it('EMAIL_TAKEN con el mismo email, aunque cambien mayúsculas o espacios', async () => {
    const { signUp } = setup()
    await signUp({ email: 'ana@um.edu.uy' })

    await expect(signUp({ email: 'ana@um.edu.uy' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 })
    await expect(signUp({ email: '  ANA@UM.edu.uy ' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('dos registros simultáneos con el mismo email: uno gana, el otro EMAIL_TAKEN', async () => {
    const { signUp } = setup()

    const results = await Promise.allSettled([signUp({ email: 'same@um.edu.uy' }), signUp({ email: 'same@um.edu.uy' })])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected').reason).toMatchObject({ code: 'EMAIL_TAKEN' })
    expect(await User.countDocuments({ email: 'same@um.edu.uy' })).toBe(1)
  })

  it('el hash del refresh token es lo único que se guarda, nunca el token', async () => {
    const { signUp } = setup()

    const { refreshToken, user } = await signUp()

    const session = await Session.findOne({ userId: user.id })
    expect(session.refreshTokenHash).toBe(sha256(refreshToken))
    expect(JSON.stringify(session.toObject())).not.toContain(refreshToken)
  })
})

describe('login', () => {
  it('devuelve usuario y tokens, y cada login abre una sesión nueva (varios dispositivos a la vez)', async () => {
    const { signUp, authService } = setup()
    const { user } = await signUp({ email: 'ana@um.edu.uy' })

    const phone = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD, deviceLabel: 'android' })
    const tablet = await authService.login({ email: 'ANA@um.edu.uy ', password: TEST_PASSWORD, deviceLabel: 'ios' })

    expect(phone.user.id).toBe(user.id)
    expect(await Session.countDocuments({ userId: user.id, revokedAt: null })).toBe(3) // registro + 2 logins
    // Las dos sesiones siguen vivas: iniciar sesión en la segunda no invalida la primera.
    await expect(authService.refresh({ refreshToken: phone.refreshToken })).resolves.toBeDefined()
    await expect(authService.refresh({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
  })

  it('contraseña incorrecta y email inexistente dan exactamente el mismo error', async () => {
    const { signUp, authService } = setup()
    await signUp({ email: 'ana@um.edu.uy' })

    const wrongPassword = await authService.login({ email: 'ana@um.edu.uy', password: 'incorrecta-123' }).catch((e) => e)
    const unknownEmail = await authService.login({ email: 'nadie@um.edu.uy', password: TEST_PASSWORD }).catch((e) => e)

    expect(wrongPassword).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 })
    expect(unknownEmail.code).toBe(wrongPassword.code)
    expect(unknownEmail.message).toBe(wrongPassword.message)
    expect(unknownEmail.status).toBe(wrongPassword.status)
  })

  it('con un email inexistente igual verifica un hash (para no distinguir por tiempo de respuesta)', async () => {
    const { authService, passwordHasher } = setup()
    const verify = vi.spyOn(passwordHasher, 'verify')

    await authService.login({ email: 'nadie@um.edu.uy', password: TEST_PASSWORD }).catch(() => {})

    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('un hash con formato inválido (los seeds viejos) es INVALID_CREDENTIALS, no un 500', async () => {
    const { authService } = setup()
    await User.create({ email: 'seed@junte.test', passwordHash: '!seed-no-login', name: 'Seed' })

    await expect(authService.login({ email: 'seed@junte.test', password: TEST_PASSWORD })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('usuario suspendido con la contraseña correcta → ACCOUNT_SUSPENDED y pierde todas sus sesiones', async () => {
    const { signUp, authService } = setup()
    const { user } = await signUp({ email: 'ana@um.edu.uy' })
    await User.updateOne({ _id: user.id }, { status: 'suspended' })

    await expect(authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', status: 401 })

    expect(await Session.countDocuments({ userId: user.id, revokedAt: null })).toBe(0)
  })

  it('usuario suspendido con contraseña incorrecta → INVALID_CREDENTIALS (no revela el estado)', async () => {
    const { signUp, authService } = setup()
    const { user } = await signUp({ email: 'ana@um.edu.uy' })
    await User.updateOne({ _id: user.id }, { status: 'suspended' })

    await expect(authService.login({ email: 'ana@um.edu.uy', password: 'incorrecta-123' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })
})

describe('tope de sesiones activas', () => {
  it('al abrir la sexta sesión se revoca la más antigua', async () => {
    const { signUp, authService } = setup()
    const first = await signUp({ email: 'ana@um.edu.uy' })
    const others = []
    for (let i = 0; i < 4; i++) others.push(await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD }))
    expect(await Session.countDocuments({ userId: first.user.id, revokedAt: null })).toBe(5)

    const sixth = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })

    expect(await Session.countDocuments({ userId: first.user.id, revokedAt: null })).toBe(5)
    await expect(authService.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await expect(authService.refresh({ refreshToken: others[0].refreshToken })).resolves.toBeDefined()
    await expect(authService.refresh({ refreshToken: sixth.refreshToken })).resolves.toBeDefined()
  })

  it('el tope es por usuario', async () => {
    const { signUp } = setup({ maxActiveSessions: 1 })
    const ana = await signUp({ email: 'ana@um.edu.uy' })

    await signUp({ email: 'beto@um.edu.uy' })

    expect(await Session.countDocuments({ userId: ana.user.id, revokedAt: null })).toBe(1)
  })
})

describe('refresh', () => {
  it('rota el par: el nuevo refresh funciona y cambia el hash vigente de la sesión', async () => {
    const { signUp, authService, clock } = setup()
    const first = await signUp()
    clock.advance(60 * 1000)

    const second = await authService.refresh({ refreshToken: first.refreshToken })

    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(second.accessToken).not.toBe(first.accessToken)
    const session = await Session.findOne({ userId: first.user.id })
    expect(session.refreshTokenHash).toBe(sha256(second.refreshToken))
    expect(session.lastUsedAt).toEqual(clock.now())
    await expect(authService.refresh({ refreshToken: second.refreshToken })).resolves.toBeDefined()
  })

  it('reutilizar un refresh viejo → UNAUTHENTICATED y la sesión queda revocada', async () => {
    const { signUp, authService } = setup()
    const first = await signUp()
    const second = await authService.refresh({ refreshToken: first.refreshToken })

    await expect(authService.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })

    // El token nuevo de esa sesión tampoco sirve: puede haberlo robado quien reutilizó el viejo.
    await expect(authService.refresh({ refreshToken: second.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    expect((await Session.findOne({ userId: first.user.id })).revokedAt).toBeInstanceOf(Date)
  })

  it('el reuso revoca solo esa sesión, no las de los otros dispositivos', async () => {
    const { signUp, authService } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })
    await authService.refresh({ refreshToken: phone.refreshToken })

    await authService.refresh({ refreshToken: phone.refreshToken }).catch(() => {})

    await expect(authService.refresh({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
  })

  it('10 refresh simultáneos con el mismo token: exactamente uno tiene éxito', async () => {
    const { signUp, authService } = setup()
    const { refreshToken } = await signUp()

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => authService.refresh({ refreshToken })))

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    for (const failure of results.filter((r) => r.status === 'rejected')) {
      expect(failure.reason).toMatchObject({ code: 'UNAUTHENTICATED' })
    }
  })

  it('refresh vencido (más de 30 días) → UNAUTHENTICATED, no TOKEN_EXPIRED', async () => {
    const { signUp, authService, clock } = setup()
    const { refreshToken } = await signUp()

    clock.advance(31 * DAY_MS)

    await expect(authService.refresh({ refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('cada refresh extiende la sesión 30 días más', async () => {
    const { signUp, authService, clock } = setup()
    let { refreshToken } = await signUp()
    for (let i = 0; i < 3; i++) {
      clock.advance(20 * DAY_MS)
      ;({ refreshToken } = await authService.refresh({ refreshToken }))
    }

    await expect(authService.refresh({ refreshToken })).resolves.toBeDefined() // 60 días después del registro
  })

  it('un access token no sirve como refresh', async () => {
    const { signUp, authService } = setup()
    const { accessToken } = await signUp()

    await expect(authService.refresh({ refreshToken: accessToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('basura → UNAUTHENTICATED', async () => {
    const { authService } = setup()

    await expect(authService.refresh({ refreshToken: 'basura' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('usuario suspendido → ACCOUNT_SUSPENDED y pierde todas sus sesiones, también las de otros dispositivos', async () => {
    const { signUp, authService } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })
    await User.updateOne({ _id: phone.user.id }, { status: 'suspended' })

    await expect(authService.refresh({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', status: 401 })

    expect(await Session.countDocuments({ userId: phone.user.id, revokedAt: null })).toBe(0)
    await expect(authService.refresh({ refreshToken: tablet.refreshToken })).rejects.toMatchObject({ status: 401 })
  })

  it('si el usuario ya no existe → UNAUTHENTICATED', async () => {
    const { signUp, authService } = setup()
    const { refreshToken, user } = await signUp()
    await User.deleteOne({ _id: user.id })

    await expect(authService.refresh({ refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('logout', () => {
  it('cierra solo la sesión actual', async () => {
    const { signUp, authService } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })
    const { sid } = await authService.authenticate(phone.accessToken)

    await authService.logout({ sid })

    await expect(authService.refresh({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await expect(authService.refresh({ refreshToken: tablet.refreshToken })).resolves.toBeDefined()
  })

  it('es idempotente', async () => {
    const { signUp, authService } = setup()
    const { accessToken } = await signUp()
    const { sid } = await authService.authenticate(accessToken)

    await authService.logout({ sid })

    await expect(authService.logout({ sid })).resolves.toBeUndefined()
  })

  it('logoutAll cierra todas las sesiones del usuario y no las de otros', async () => {
    const { signUp, authService } = setup()
    const phone = await signUp({ email: 'ana@um.edu.uy' })
    const tablet = await authService.login({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })
    const other = await signUp({ email: 'beto@um.edu.uy' })

    await authService.logoutAll({ userId: phone.user.id })

    await expect(authService.refresh({ refreshToken: phone.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await expect(authService.refresh({ refreshToken: tablet.refreshToken })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await expect(authService.refresh({ refreshToken: other.refreshToken })).resolves.toBeDefined()
  })
})

describe('authenticate (access token)', () => {
  it('devuelve el usuario (id y rol) y la sesión', async () => {
    const { signUp, authService } = setup()
    const { accessToken, user } = await signUp()

    const auth = await authService.authenticate(accessToken)

    expect(auth).toMatchObject({ user: { id: user.id, role: 'user' }, sid: expect.any(String) })
    expect(auth.user).not.toHaveProperty('passwordHash')
  })

  it('token vencido → TOKEN_EXPIRED', async () => {
    const { signUp, authService, clock } = setup()
    const { accessToken } = await signUp()

    clock.advance(16 * 60 * 1000)

    await expect(authService.authenticate(accessToken)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 })
  })

  it('usuario suspendido → ACCOUNT_SUSPENDED (401) aunque el token sea válido', async () => {
    const { signUp, authService } = setup()
    const { accessToken, user } = await signUp()
    await User.updateOne({ _id: user.id }, { status: 'suspended' })

    await expect(authService.authenticate(accessToken)).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', status: 401 })
  })

  it('usuario inexistente → UNAUTHENTICATED', async () => {
    const { signUp, authService } = setup()
    const { accessToken, user } = await signUp()
    await User.deleteOne({ _id: user.id })

    await expect(authService.authenticate(accessToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('el rol se lee del usuario en cada request: un cambio de rol tiene efecto inmediato', async () => {
    const { signUp, authService } = setup()
    const { accessToken, user } = await signUp()
    await User.updateOne({ _id: user.id }, { role: 'admin' })

    expect((await authService.authenticate(accessToken)).user.role).toBe('admin')
  })

  it('límite documentado: tras un logout el access token sigue valiendo hasta que vence (15 min)', async () => {
    const { signUp, authService } = setup()
    const { accessToken } = await signUp()
    const { sid } = await authService.authenticate(accessToken)
    await authService.logout({ sid })

    await expect(authService.authenticate(accessToken)).resolves.toBeDefined()
  })
})
