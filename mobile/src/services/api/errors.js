// Errores de la API tal como los ve la app. Todo error del cliente HTTP se convierte en ApiError.
// Catálogo del back: docs/practicas/errores-y-logs.md (y back-service/src/shared/errors.js).

/**
 * Códigos que genera SOLO la app (el back nunca los devuelve). Van con `status: 0`
 * porque no hubo respuesta HTTP, salvo UNKNOWN_ERROR.
 */
export const CLIENT_ERROR_CODES = Object.freeze({
  /** Sin respuesta: sin conexión, DNS, TLS, servidor inalcanzable. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** La request superó el timeout del cliente. */
  TIMEOUT: 'TIMEOUT',
  /** La request se canceló desde la app (AbortController, pantalla desmontada). */
  REQUEST_CANCELED: 'REQUEST_CANCELED',
  /** Respuesta HTTP de error sin `code` y con un status que no tiene código genérico en el catálogo. */
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
})

/**
 * Código del catálogo que se asume cuando la respuesta no trae `code`
 * (p. ej. HTML de un ALB, 502 de Nginx, cuerpo vacío).
 */
const FALLBACK_CODE_BY_STATUS = Object.freeze({
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED'
})

/** Mensajes en español para cuando el servidor no manda `message` (o no hubo respuesta). */
const DEFAULT_MESSAGES = Object.freeze({
  NETWORK_ERROR: 'No pudimos conectarnos con el servidor. Revisá tu conexión.',
  TIMEOUT: 'El servidor tardó demasiado en responder. Probá de nuevo.',
  REQUEST_CANCELED: 'La operación se canceló.',
  UNKNOWN_ERROR: 'Ocurrió un error inesperado.',
  VALIDATION_ERROR: 'Hay datos inválidos en la solicitud.',
  UNAUTHENTICATED: 'Tenés que iniciar sesión.',
  FORBIDDEN: 'No tenés permiso para esta acción.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  RATE_LIMITED: 'Demasiados intentos. Esperá un momento y probá de nuevo.',
  INTERNAL: 'Ocurrió un error en el servidor. Probá más tarde.'
})

export class ApiError extends Error {
  /**
   * @param {object} params
   * @param {number} params.status   Status HTTP; 0 si no hubo respuesta.
   * @param {string} params.code     Código del catálogo o de CLIENT_ERROR_CODES.
   * @param {string} [params.message] Mensaje apto para mostrar al usuario.
   * @param {string|null} [params.requestId] Para rastrear en los logs del back/Nginx.
   * @param {unknown} [params.details] Detalle opcional (p. ej. campos de VALIDATION_ERROR).
   */
  constructor ({ status, code, message, requestId = null, details }) {
    super(message ?? DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.UNKNOWN_ERROR)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

/** @param {unknown} error */
export function isApiError (error) {
  return error instanceof ApiError
}

/**
 * Código a usar cuando la respuesta no trae uno válido.
 * @param {number} status
 */
export function fallbackCodeForStatus (status) {
  if (status >= 500) return 'INTERNAL'
  return FALLBACK_CODE_BY_STATUS[status] ?? CLIENT_ERROR_CODES.UNKNOWN_ERROR
}

/** @param {string} code */
export function defaultMessageFor (code) {
  return DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.UNKNOWN_ERROR
}
