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
  PROFILE_INCOMPLETE: 'Completá tu perfil (nombre, fecha de nacimiento y al menos un interés) para crear planes.',
  PLAN_CLOSED: 'Este plan ya no se puede modificar.',
  [CLIENT_ERROR_CODES.NETWORK_ERROR]: 'No pudimos conectarnos con el servidor. Revisá tu conexión.',
  [CLIENT_ERROR_CODES.TIMEOUT]: 'El servidor tardó demasiado en responder. Probá de nuevo.'
})

/** Textos del chat: el mismo `code` (FORBIDDEN, NOT_FOUND…) significa otra cosa que en el resto de la app. */
export const CHAT_ERROR_MESSAGES = Object.freeze({
  FORBIDDEN: 'Solo quienes están anotados y quien creó el plan pueden usar el chat.',
  NOT_FOUND: 'Este plan no está disponible.',
  VALIDATION_ERROR: 'El mensaje no es válido: tiene que tener entre 1 y 2000 caracteres.'
})

const GENERIC = 'Ocurrió un error inesperado. Probá de nuevo.'

/** No hubo respuesta del servidor (sin conexión o se demoró demasiado): se muestra como "sin conexión". */
export function isOfflineError (error) {
  return isApiError(error) && (error.code === CLIENT_ERROR_CODES.NETWORK_ERROR || error.code === CLIENT_ERROR_CODES.TIMEOUT)
}

/**
 * @param {unknown} error
 * @param {Record<string, string>} [overrides]  Textos propios de una acción (inscribirse, check-in…): el mismo `code`
 *   no significa lo mismo en todas las pantallas. Tienen prioridad sobre los generales.
 * @returns {string}
 */
export function messageForError (error, overrides = {}) {
  if (!isApiError(error)) return GENERIC
  return overrides[error.code] ?? MESSAGES[error.code] ?? (error.message || GENERIC)
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
