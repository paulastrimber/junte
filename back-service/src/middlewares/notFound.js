import { errors } from '../shared/errors.js'

/** Ninguna ruta respondió: 404 NOT_FOUND con el formato estándar (lo arma el errorHandler). */
export function notFound (req, res, next) {
  next(errors.notFound('La ruta solicitada no existe'))
}
