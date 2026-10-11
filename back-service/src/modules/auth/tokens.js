// Emisión y verificación de JWT (S2-BE-02). docs/arquitectura/09-seguridad.md#autenticación-back-service.
//
// - HS256 fijo: al verificar se pasa `algorithms: ['HS256']`, así `alg: none` y la confusión de
//   algoritmos (HS512, RS256 con la clave como secreto) quedan rechazados antes de mirar la firma.
// - `typ` va como claim del payload ('access' | 'refresh') y se compara después de verificar la firma:
//   un refresh no sirve como access ni al revés.
// - Access: sub (userId), sid (sesión), typ, iat, exp. Refresh: lo mismo + jti aleatorio.
// - Decodificar sin verificar nunca autentica: acá no existe ninguna función que lo haga.
// - El reloj es inyectado (`clock`) para testear el vencimiento sin esperar.
import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose'
import { AppError, errors } from '../../shared/errors.js'

export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

const ALGORITHM = 'HS256'
const MIN_SECRET_LENGTH = 32
const TYPES = Object.freeze({ ACCESS: 'access', REFRESH: 'refresh' })

/**
 * @param {object} params
 * @param {string} params.secret  JWT_SECRET (mínimo 32 caracteres).
 * @param {import('../../adapters/clock.js').Clock} params.clock
 * @param {() => string} [params.generateId]  Generador del `jti` (inyectable para tests).
 * @param {number} [params.accessTtlSeconds]
 * @param {number} [params.refreshTtlSeconds]
 */
export function createTokenService ({
  secret,
  clock,
  generateId = randomUUID,
  accessTtlSeconds = ACCESS_TTL_SECONDS,
  refreshTtlSeconds = REFRESH_TTL_SECONDS
}) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`el secreto de los tokens debe tener al menos ${MIN_SECRET_LENGTH} caracteres`)
  }
  const key = new TextEncoder().encode(secret)

  async function sign ({ typ, userId, sid, ttlSeconds, jti }) {
    const issuedAt = Math.floor(clock.now().getTime() / 1000)
    const expiresAtSeconds = issuedAt + ttlSeconds
    const builder = new SignJWT({ typ, sid })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
    if (jti) builder.setJti(jti)
    return { token: await builder.sign(key), expiresAt: new Date(expiresAtSeconds * 1000) }
  }

  /** Verifica firma, algoritmo, vencimiento y `typ`. Devuelve el payload o lanza AppError. */
  async function verify (token, typ, { expiredCode }) {
    let payload
    try {
      ;({ payload } = await jwtVerify(token, key, {
        algorithms: [ALGORITHM],
        currentDate: clock.now(),
        requiredClaims: ['sub', 'exp', 'iat']
      }))
    } catch (err) {
      // El motivo exacto (firma, algoritmo, formato) no se le cuenta al cliente.
      if (err instanceof joseErrors.JWTExpired) {
        throw new AppError(expiredCode, expiredCode === 'TOKEN_EXPIRED' ? 'La sesión venció' : 'Tenés que iniciar sesión')
      }
      throw errors.unauthenticated()
    }
    if (payload.typ !== typ || typeof payload.sid !== 'string' || payload.sid === '') throw errors.unauthenticated()
    return payload
  }

  return {
    /** @returns {Promise<{ token: string, expiresAt: Date }>} */
    signAccess: ({ userId, sid }) => sign({ typ: TYPES.ACCESS, userId, sid, ttlSeconds: accessTtlSeconds }),

    /** @returns {Promise<{ token: string, jti: string, expiresAt: Date }>} */
    async signRefresh ({ userId, sid }) {
      const jti = generateId()
      const { token, expiresAt } = await sign({ typ: TYPES.REFRESH, userId, sid, ttlSeconds: refreshTtlSeconds, jti })
      return { token, jti, expiresAt }
    },

    /**
     * @returns {Promise<{ userId: string, sid: string }>}
     * @throws {AppError} TOKEN_EXPIRED si venció; UNAUTHENTICATED en cualquier otro caso.
     */
    async verifyAccess (token) {
      const payload = await verify(token, TYPES.ACCESS, { expiredCode: 'TOKEN_EXPIRED' })
      return { userId: payload.sub, sid: payload.sid }
    },

    /**
     * Un refresh vencido es UNAUTHENTICATED: TOKEN_EXPIRED le diría a la app que vuelva a intentar el refresh.
     * @returns {Promise<{ userId: string, sid: string, jti: string }>}
     * @throws {AppError} UNAUTHENTICATED
     */
    async verifyRefresh (token) {
      const payload = await verify(token, TYPES.REFRESH, { expiredCode: 'UNAUTHENTICATED' })
      if (typeof payload.jti !== 'string' || payload.jti === '') throw errors.unauthenticated()
      return { userId: payload.sub, sid: payload.sid, jti: payload.jti }
    }
  }
}
