// AppError + catálogo de docs/practicas/errores-y-logs.md. Dueño: Agente A (S1-BE-03).
// Agregar un código = agregarlo en el doc, acá y en la app, en el mismo PR.

/** @type {Readonly<Record<string, number>>} code → status HTTP */
export const STATUS_BY_CODE = Object.freeze({
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_SUSPENDED: 401,
  FORBIDDEN: 403,
  QR_INVALID: 403,
  OUT_OF_RANGE: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  PROFILE_INCOMPLETE: 409,
  PLAN_FULL: 409,
  PLAN_CLOSED: 409,
  ALREADY_JOINED: 409,
  CAPACITY_BELOW_PARTICIPANTS: 409,
  CHECKIN_WINDOW_CLOSED: 409,
  ALREADY_CHECKED_IN: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500
})

/**
 * Error de dominio. El errorHandler lo traduce a `{ code, message, requestId }`.
 * @param {keyof typeof STATUS_BY_CODE} code
 * @param {string} message  Mensaje en español, apto para mostrar al usuario.
 * @param {{ status?: number, details?: unknown }} [options]
 */
export class AppError extends Error {
  constructor (code, message, { status, details } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status ?? STATUS_BY_CODE[code] ?? 500
    this.details = details
  }
}

/**
 * @param {unknown} err
 * @returns {err is AppError}
 */
export function isAppError (err) {
  return err instanceof AppError
}

/**
 * Fábricas de errores comunes a todos los módulos. Los errores propios de un dominio
 * (PLAN_FULL, QR_INVALID, …) se crean en su módulo con `new AppError(code, message)`.
 */
export const errors = Object.freeze({
  /** @param {Array<{ path: string, message: string }>} [details] */
  validation: (details, message = 'Los datos enviados no son válidos') =>
    new AppError('VALIDATION_ERROR', message, { details }),
  unauthenticated: (message = 'Tenés que iniciar sesión') =>
    new AppError('UNAUTHENTICATED', message),
  forbidden: (message = 'No tenés permiso para esta acción') =>
    new AppError('FORBIDDEN', message),
  notFound: (message = 'No encontramos lo que buscabas') =>
    new AppError('NOT_FOUND', message),
  internal: (message = 'Ocurrió un error inesperado') =>
    new AppError('INTERNAL', message)
})
