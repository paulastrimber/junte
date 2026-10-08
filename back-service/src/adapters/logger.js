// Logger estructurado (pino → stdout → agente de CloudWatch). Ver docs/practicas/errores-y-logs.md.
import { pino } from 'pino'

/**
 * Red de seguridad: además de no pasar estos datos al logger, se censuran si aparecen.
 * Nunca se loguean contraseñas, tokens, cookies, el QR ni coordenadas exactas.
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
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.qrToken',
  '*.latitude',
  '*.longitude',
  '*.coordinates'
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
