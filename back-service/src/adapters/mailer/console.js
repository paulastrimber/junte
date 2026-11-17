// Mailer de desarrollo local (NODE_ENV=development sin RESEND_API_KEY): no envía nada y muestra el email en el log,
// para poder probar la recuperación de contraseña sin una cuenta de Resend. Es la única excepción a "nunca un código
// en los logs" y solo existe en desarrollo: en producción sin credenciales se usa noop.js, que no muestra el contenido.

/**
 * @param {{ logger: { info: (obj: object, msg: string) => void } }} params
 * @returns {import('./index.js').Mailer}
 */
export function createConsoleMailer ({ logger }) {
  return {
    async send ({ to, subject, text }) {
      // `recipient` y `body` y no `email` y `text`: esos nombres los censura el logger (adapters/logger.js).
      logger.info({ event: 'mail.dev', recipient: to, subject, body: text }, 'mail not sent (development): shown here instead')
    }
  }
}
