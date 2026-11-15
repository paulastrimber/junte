// Mailer sin credenciales en producción (sin RESEND_API_KEY): no envía nada, no guarda nada y solo avisa en el log
// que un email se descartó, sin el destinatario ni el contenido (lleva un código de un solo uso).

/**
 * @param {{ logger: { warn: (obj: object, msg: string) => void } }} params
 * @returns {import('./index.js').Mailer}
 */
export function createNoopMailer ({ logger }) {
  return {
    async send () {
      logger.warn({ event: 'mail.disabled' }, 'mail disabled: email not sent (set RESEND_API_KEY and MAIL_FROM)')
    }
  }
}
