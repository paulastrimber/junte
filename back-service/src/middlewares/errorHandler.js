// Normaliza todo error a `{ code, message, requestId }` (+ `details` en VALIDATION_ERROR).
// Nunca responde stack traces, mensajes de MongoDB ni detalles internos.
import { AppError, isAppError } from '../shared/errors.js'

const INTERNAL_MESSAGE = 'Ocurrió un error inesperado'

function isZodError (err) {
  return Array.isArray(err?.issues) && (err.name === 'ZodError' || err.name === '$ZodError')
}

// Un campo desconocido (.strict) se informa con el nombre del campo, no con el del objeto.
function detailsOf (issue) {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({ path: [...issue.path, key].join('.'), message: 'Este campo no está permitido' }))
  }
  return [{ path: issue.path.join('.'), message: issue.message }]
}

function fromZod (err) {
  const details = err.issues.flatMap(detailsOf)
  return new AppError('VALIDATION_ERROR', 'Los datos enviados no son válidos', { details })
}

// Errores 4xx de body-parser o del router de Express (http-errors con `expose: true`).
function isHttpClientError (err) {
  const status = err?.status ?? err?.statusCode
  return err?.expose === true && Number.isInteger(status) && status >= 400 && status < 500
}

function fromHttpClientError (err) {
  if (err.type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', 'El cuerpo de la solicitud no es JSON válido')
  }
  if (err.type === 'entity.too.large') {
    // TODO(S1-BE-03): el catálogo no tiene un code propio para 413; ver docs/pendientes.md (back-core).
    return new AppError('VALIDATION_ERROR', 'El cuerpo de la solicitud es demasiado grande', { status: 413 })
  }
  return new AppError('VALIDATION_ERROR', 'La solicitud no es válida')
}

/**
 * También lo usan los handlers de Socket.io: mismo formato de error por los dos caminos.
 * @returns {AppError | null} null si el error no es previsto (→ 500 INTERNAL).
 */
export function toAppError (err) {
  if (isAppError(err)) return err
  if (isZodError(err)) return fromZod(err)
  if (isHttpClientError(err)) return fromHttpClientError(err)
  return null
}

// Express reconoce un error handler por tener 4 parámetros: `next` es obligatorio aunque casi no se use.
export function errorHandler (err, req, res, next) {
  if (res.headersSent) return next(err)

  const known = toAppError(err)
  const status = known?.status ?? 500
  // El httpLogger agrega `res.err` (con stack) a la línea de log de esta request.
  if (status >= 500) res.err = err

  res.status(status).json({
    code: known?.code ?? 'INTERNAL',
    message: known?.message ?? INTERNAL_MESSAGE,
    requestId: req.id ?? null,
    ...(known?.details ? { details: known.details } : {})
  })
}
