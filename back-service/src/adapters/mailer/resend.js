// Resend, API HTTPS (https://resend.com/docs/api-reference/emails/send-email): un POST por email, sin SDK.
// Para mandar a cualquier dirección, el dominio de MAIL_FROM tiene que estar verificado en Resend (registros DNS).
// Nunca se loguea ni se incluye en un error la clave, el destinatario ni el contenido: solo el status HTTP.

const SEND_URL = 'https://api.resend.com/emails'
const REQUEST_TIMEOUT_MS = 5000

/**
 * @param {object} params
 * @param {string} params.apiKey  RESEND_API_KEY (secreto).
 * @param {string} params.from  Remitente, p. ej. `junte <no-reply@junteapp.me>`.
 * @param {typeof fetch} [params.fetch]
 * @returns {import('./index.js').Mailer}
 */
export function createResendMailer ({ apiKey, from, fetch = globalThis.fetch }) {
  return {
    async send ({ to, subject, text, html }) {
      let res
      try {
        res = await fetch(SEND_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        })
      } catch (err) {
        // Sin `cause`: el error original puede traer la request completa.
        throw new Error(`Resend request failed (${err?.name ?? 'Error'})`)
      }
      if (!res.ok) throw new Error(`Resend responded with HTTP ${res.status}`)
    }
  }
}
