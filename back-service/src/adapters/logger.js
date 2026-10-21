// Logger estructurado (pino → stdout → agente de CloudWatch). Ver docs/practicas/errores-y-logs.md.
import { pino } from 'pino'

/**
 * Red de seguridad: además de no pasar estos datos al logger, se censuran si aparecen.
 * Nunca se loguean contraseñas, tokens, cookies, el QR, coordenadas exactas ni la fecha de nacimiento,
 * el barrio o la localidad del perfil.
 */
export const REDACT_PATHS = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'cookie',
  'password',
  'accessToken',
  'refreshToken',
  'token',
  'qrToken',
  'latitude',
  'longitude',
  // Datos personales del perfil (docs/pendientes.md#fecha-de-nacimiento-y-ubicación-del-perfil).
  'birthDate',
  'neighborhood',
  'city',
  // Hashes y URLs firmadas de S3 (una URL firmada es una credencial temporal).
  'passwordHash',
  'refreshTokenHash',
  'photoUrl',
  // Contenido que escribe la gente y el email (S6-BE-05): el texto del chat, la descripción de un reporte.
  'email',
  'text',
  'description',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.qrToken',
  '*.latitude',
  '*.longitude',
  '*.coordinates',
  '*.birthDate',
  '*.neighborhood',
  '*.city',
  '*.passwordHash',
  '*.refreshTokenHash',
  '*.photoUrl',
  '*.email',
  '*.text',
  '*.description'
])

/**
 * @param {{ level?: string, destination?: import('pino').DestinationStream }} [options]
 *   `destination` permite capturar la salida en tests; por defecto stdout.
 * @returns {import('pino').Logger}
 */
export function createLogger ({ level = 'info', destination } = {}) {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' }
  }, destination)
}
