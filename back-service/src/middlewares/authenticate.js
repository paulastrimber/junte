// Autentica la request con el access token del header Authorization (S2-BE-07).
// La verificación y las reglas (firma, algoritmo, exp, typ, usuario existe y active) viven en authService.
import { errors } from '../shared/errors.js'

// El token es base64url con puntos; cualquier otra cosa ni se intenta verificar.
const BEARER = /^Bearer ([A-Za-z0-9_.-]+)$/i

/**
 * Deja `req.user = { id, role }` y `req.auth = { sid }`. No guarda el documento del usuario en la
 * request: así un controlador no puede filtrar sin querer el passwordHash.
 * @param {{ authService: { authenticate: (token: string) => Promise<{ user: { id: string, role: string }, sid: string }> } }} deps
 * @returns {import('express').RequestHandler}
 */
export function createAuthenticate ({ authService }) {
  return async function authenticate (req, res, next) {
    const match = BEARER.exec(req.get('Authorization') ?? '')
    if (!match) throw errors.unauthenticated()

    const { user, sid } = await authService.authenticate(match[1])
    req.user = user
    req.auth = { sid }
    next()
  }
}
