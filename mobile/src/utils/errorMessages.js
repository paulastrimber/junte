// Qué texto mostrar para cada `code` de error. La app DECIDE según `code` (nunca según `message`); el
// `message` del servidor es el respaldo cuando el código no tiene un texto propio acá.
import { CLIENT_ERROR_CODES, isApiError } from '../services/api/errors.js'

const MESSAGES = Object.freeze({
  EMAIL_TAKEN: 'Ya existe una cuenta con ese email.',
  INVALID_CREDENTIALS: 'Email o contraseña incorrectos.',
  ACCOUNT_SUSPENDED: 'Tu cuenta está suspendida.',
  RATE_LIMITED: 'Demasiados intentos. Esperá un momento y probá de nuevo.',
  UNAUTHENTICATED: 'Tu sesión terminó. Iniciá sesión de nuevo.',
  TOKEN_EXPIRED: 'Tu sesión terminó. Iniciá sesión de nuevo.',
  [CLIENT_ERROR_CODES.NETWORK_ERROR]: 'No pudimos conectarnos con el servidor. Revisá tu conexión.',
  [CLIENT_ERROR_CODES.TIMEOUT]: 'El servidor tardó demasiado en responder. Probá de nuevo.'
})

const GENERIC = 'Ocurrió un error inesperado. Probá de nuevo.'

/**
 * @param {unknown} error
 * @returns {string}
 */
export function messageForError (error) {
  if (!isApiError(error)) return GENERIC
  return MESSAGES[error.code] ?? (error.message || GENERIC)
}

/**
 * Errores de un VALIDATION_ERROR agrupados por campo (`details: [{ path, message }]`).
 * @param {unknown} error
 * @returns {Record<string, string>} vacío si no hay detalle por campo.
 */
export function fieldErrorsFrom (error) {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return {}
  return error.details.reduce((fields, { path, message }) => {
    if (path && !fields[path]) fields[path] = message
    return fields
  }, {})
}
