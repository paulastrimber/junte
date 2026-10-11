// Autorización por rol. Va DESPUÉS de authenticate (que deja `req.user.role` leído del usuario, no del token).
// Es una primera barrera: los servicios de /admin vuelven a comprobar el rol (docs/arquitectura/09-seguridad.md).
import { errors } from '../shared/errors.js'

/**
 * @param {...('user' | 'admin')} roles  Roles permitidos.
 * @returns {import('express').RequestHandler}
 */
export function requireRole (...roles) {
  return function requireRoleMiddleware (req, res, next) {
    if (!req.user) throw errors.unauthenticated() // mal armado: faltó authenticate antes
    if (!roles.includes(req.user.role)) throw errors.forbidden()
    next()
  }
}
