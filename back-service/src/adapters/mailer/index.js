// Envío de emails (recuperación de contraseña). Cuatro implementaciones con la misma interfaz:
// - resend.js: Resend (API HTTPS), con RESEND_API_KEY y MAIL_FROM. Sale por el puerto 443, el único que el back tiene
//   abierto hacia Internet en AWS.
// - memory.js: solo para tests: no envía nada, guarda lo que habría mandado.
// - console.js: desarrollo local sin credenciales: no envía nada y muestra el email en el log (para probar el flujo).
// - noop.js: producción sin credenciales: no envía nada y solo avisa en el log, sin el contenido.
import { createConsoleMailer } from './console.js'
import { createMemoryMailer } from './memory.js'
import { createNoopMailer } from './noop.js'
import { createResendMailer } from './resend.js'

export { createConsoleMailer, createMemoryMailer, createNoopMailer, createResendMailer }

/**
 * Elige el adapter según la config: Resend con credencial; sin ella, en memoria en tests, el log en desarrollo y
 * no-op en producción (un email con un código nunca se escribe en los logs de producción).
 * @param {{ config: { env: string, mail: { resend: { apiKey: string }, from: string } | null }, logger: object }} params
 * @returns {Mailer}
 */
export function createMailerFromConfig ({ config, logger }) {
  if (config.mail) return createResendMailer({ apiKey: config.mail.resend.apiKey, from: config.mail.from })
  if (config.env === 'test') return createMemoryMailer()
  return config.env === 'development' ? createConsoleMailer({ logger }) : createNoopMailer({ logger })
}

/**
 * @typedef {object} Mail
 * @property {string} to  Dirección del destinatario.
 * @property {string} subject
 * @property {string} text  Versión en texto plano.
 * @property {string} [html]  Versión HTML (con todo lo que venga de una persona ya escapado).
 */

/**
 * @typedef {object} Mailer
 * @property {(mail: Mail) => Promise<void>} send  Rechaza si el proveedor no aceptó el email. El error nunca lleva
 *   la clave, el destinatario ni el contenido.
 */
