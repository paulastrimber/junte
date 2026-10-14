// Reglas de negocio de autenticación (S2-BE-03 a S2-BE-07). docs/arquitectura/adr/0008-sesiones-multiples.md.
// No importa Express ni Mongoose: todo llega por parámetro (DI).
//
// Sesiones: una por login/dispositivo (colección `sessions`). El refresh token lleva `sid` y `jti`; la
// rotación es por sesión con actualización condicional sobre el hash vigente. Reuso de un refresh viejo
// → se revoca solo esa sesión y 401. Máximo `maxActiveSessions` por usuario (se revoca la más antigua).
import { randomBytes, randomUUID } from 'node:crypto'
import { AppError, errors } from '../../shared/errors.js'
import { hashToken } from './token-hash.js'

export const MAX_ACTIVE_SESSIONS = 5

const invalidCredentials = () => new AppError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos')
const accountSuspended = () => new AppError('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida')

/**
 * @param {object} deps
 * @param {ReturnType<import('../users/user.repository.js').createUserRepository>} deps.userRepo
 * @param {ReturnType<import('./session.repository.js').createSessionRepository>} deps.sessionRepo
 * @param {import('../../adapters/passwordHasher.js').PasswordHasher} deps.passwordHasher
 * @param {ReturnType<import('./tokens.js').createTokenService>} deps.tokens
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {() => string} [deps.generateId]  Generador del `sid`.
 * @param {number} [deps.maxActiveSessions]
 */
export function createAuthService ({
  userRepo, sessionRepo, passwordHasher, tokens, clock, generateId = randomUUID, maxActiveSessions = MAX_ACTIVE_SESSIONS
}) {
  // Hash de relleno: con un email inexistente igual se verifica una contraseña, así el tiempo de
  // respuesta no distingue "no existe" de "contraseña incorrecta".
  let dummyHash = null
  const getDummyHash = () => { dummyHash ??= passwordHasher.hash(randomBytes(16).toString('hex')); return dummyHash }

  async function requireActiveUser (userId) {
    const user = await userRepo.findById(userId)
    if (!user) throw errors.unauthenticated()
    if (user.status !== 'active') throw accountSuspended()
    return user
  }

  /** Abre una sesión nueva y emite su primer par de tokens. */
  async function openSession (user, deviceLabel) {
    const now = clock.now()
    const sid = generateId()
    const refresh = await tokens.signRefresh({ userId: user.id, sid })
    await sessionRepo.create({
      userId: user.id, sid, refreshTokenHash: hashToken(refresh.token), deviceLabel, now, expiresAt: refresh.expiresAt
    })
    // Primero se crea y después se recorta: la sesión nueva nunca es la que se revoca, y si dos logins
    // simultáneos pasan el tope, ambos recortan y el resultado converge.
    await sessionRepo.revokeOldestBeyond(user.id, maxActiveSessions, { now })
    const access = await tokens.signAccess({ userId: user.id, sid })
    return { user, accessToken: access.token, refreshToken: refresh.token }
  }

  return {
    /**
     * @param {{ name: string, email: string, password: string, deviceLabel?: string }} data  Ya validado. El resto del perfil se completa después (onboarding).
     * @throws {AppError} EMAIL_TAKEN
     */
    async register ({ name, email, password, deviceLabel }) {
      const passwordHash = await passwordHasher.hash(password)
      const user = await userRepo.create({ name, email, passwordHash })
      return openSession(user, deviceLabel)
    },

    /**
     * @param {{ email: string, password: string, deviceLabel?: string }} data
     * @throws {AppError} INVALID_CREDENTIALS | ACCOUNT_SUSPENDED
     */
    async login ({ email, password, deviceLabel }) {
      const user = await userRepo.findByEmail(email)
      if (!user) {
        await passwordHasher.verify(await getDummyHash(), password)
        throw invalidCredentials()
      }
      // Un hash con formato inválido da false (nunca lanza): es "credenciales incorrectas", no un 500.
      if (!await passwordHasher.verify(user.passwordHash, password)) throw invalidCredentials()
      if (user.status !== 'active') {
        // Solo quien conoce la contraseña se entera de que la cuenta está suspendida.
        await sessionRepo.revokeAllByUser(user.id, { now: clock.now() })
        throw accountSuspended()
      }
      return openSession(user, deviceLabel)
    },

    /**
     * Rota el refresh token de una sesión.
     * @param {{ refreshToken: string }} data
     * @returns {Promise<{ accessToken: string, refreshToken: string }>}
     * @throws {AppError} UNAUTHENTICATED (inválido, vencido, revocado o reutilizado) | ACCOUNT_SUSPENDED
     */
    async refresh ({ refreshToken }) {
      const { userId, sid } = await tokens.verifyRefresh(refreshToken)
      const now = clock.now()

      const user = await userRepo.findById(userId)
      if (!user) throw errors.unauthenticated()
      if (user.status !== 'active') {
        await sessionRepo.revokeAllByUser(userId, { now })
        throw accountSuspended()
      }

      // El refresh nuevo se firma ANTES de tocar la sesión: la actualización es una sola operación
      // condicional sobre el hash vigente (nunca "consultar y después actualizar").
      const next = await tokens.signRefresh({ userId, sid })
      const rotated = await sessionRepo.rotate({
        sid, userId, currentHash: hashToken(refreshToken), newHash: hashToken(next.token), now, expiresAt: next.expiresAt
      })
      if (!rotated) {
        // Firma válida pero el hash no es el vigente (o la sesión está revocada/vencida): reuso de un
        // refresh viejo. Se cierra esa sesión —solo esa— y se responde 401.
        await sessionRepo.revokeBySid(sid, { now })
        throw errors.unauthenticated()
      }

      const access = await tokens.signAccess({ userId, sid })
      return { accessToken: access.token, refreshToken: next.token }
    },

    /** Cierra la sesión actual. Idempotente. */
    async logout ({ sid }) {
      await sessionRepo.revokeBySid(sid, { now: clock.now() })
    },

    /** Cierra todas las sesiones del usuario. */
    async logoutAll ({ userId }) {
      await sessionRepo.revokeAllByUser(userId, { now: clock.now() })
    },

    /**
     * Cierra todas las sesiones de un usuario (p. ej. cuando un admin lo suspende, S6).
     * @param {string} userId
     * @returns {Promise<number>} cuántas cerró.
     */
    revokeAllSessions: (userId) => sessionRepo.revokeAllByUser(userId, { now: clock.now() }),

    /**
     * Autentica un access token: firma, algoritmo, vencimiento, `typ`, y que el usuario exista y esté
     * activo. El rol se lee del usuario en cada request (ADR-0004): un cambio tiene efecto inmediato.
     * Límite: no mira la sesión, así que tras un logout el access token vale hasta su vencimiento (15 min).
     * @param {string} accessToken
     * @returns {Promise<{ user: { id: string, role: 'user' | 'admin' }, sid: string }>}
     * @throws {AppError} TOKEN_EXPIRED | UNAUTHENTICATED | ACCOUNT_SUSPENDED
     */
    async authenticate (accessToken) {
      const { userId, sid } = await tokens.verifyAccess(accessToken)
      const user = await requireActiveUser(userId)
      return { user: { id: user.id, role: user.role }, sid }
    },

    /**
     * Para conexiones largas (Socket.io): el token se verificó al conectar; en cada evento se comprueba que el
     * usuario siga existiendo y activo.
     * @param {string} userId
     * @throws {AppError} UNAUTHENTICATED | ACCOUNT_SUSPENDED
     */
    async assertActive (userId) {
      await requireActiveUser(userId)
    }
  }
}
