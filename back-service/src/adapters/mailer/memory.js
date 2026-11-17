// Mailer en memoria para tests: no sale nada del proceso. `sent` guarda lo que se habría enviado (crece sin límite:
// solo para tests). `failNext()` hace que el próximo envío falle, para probar que un email caído no rompe el flujo.

/**
 * @returns {import('./index.js').Mailer & { sent: import('./index.js').Mail[], failNext: () => void }}
 */
export function createMemoryMailer () {
  const sent = []
  let shouldFail = false
  return {
    sent,
    failNext () {
      shouldFail = true
    },
    async send (mail) {
      if (shouldFail) {
        shouldFail = false
        throw new Error('memory mailer: simulated failure')
      }
      sent.push({ ...mail })
    }
  }
}
