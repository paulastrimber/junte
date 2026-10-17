// Qué texto mostrar para cada `code` de error. La app DECIDE según `code` (nunca según `message`); el
// `message` del servidor es el respaldo cuando el código no tiene un texto propio acá.
import { toApiError } from '../services/api/client.js'
import { CLIENT_ERROR_CODES, defaultMessageFor, isApiError } from '../services/api/errors.js'

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
  FORBIDDEN: 'Solo quienes se inscribieron y quien creó el plan pueden usar el chat.',
  NOT_FOUND: 'Este plan no está disponible.',
  VALIDATION_ERROR: 'El mensaje no es válido: tiene que tener entre 1 y 2000 caracteres.'
})

// Un solo texto genérico en toda la app: el mismo que usa el ApiError cuando no hay otro.
const GENERIC = defaultMessageFor(CLIENT_ERROR_CODES.UNKNOWN_ERROR)

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
 * Error listo para pintar: el contrato único entre hooks y screens. Toda falla que un hook expone pasa por acá, así
 * la pantalla nunca decide textos ni pierde el `requestId`.
 * @typedef {{ code: string, message: string, requestId: string | null }} ViewError
 */

/**
 * @param {unknown} error  Lo que se atrapó en un `catch` (ApiError, error de axios o de programación).
 * @param {Record<string, string>} [overrides]  Textos propios de la acción, por `code` (ver `messageForError`).
 * @returns {ViewError}
 */
export function toViewError (error, overrides = {}) {
  const apiError = toApiError(error)
  // Un error de programación (ni ApiError ni de axios: `toApiError` lo deja como UNKNOWN_ERROR) usa el texto genérico,
  // sin exponer su mensaje interno. Un error de axios crudo (sin el interceptor) se explica igual que su ApiError.
  const isProgrammingError = !isApiError(error) && apiError.code === CLIENT_ERROR_CODES.UNKNOWN_ERROR
  const message = isProgrammingError ? GENERIC : messageForError(apiError, overrides)
  return { code: apiError.code, message, requestId: apiError.requestId ?? null }
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
