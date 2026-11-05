// Push sin credenciales fuera de tests (local, producción sin FCM_SERVICE_ACCOUNT): no envía nada, no guarda nada
// (sin estado: no crece con el tiempo) y solo loguea cuántos avisos se descartaron, nunca los tokens ni el contenido.

/**
 * @param {{ logger: { info: (obj: object, msg: string) => void } }} params
 * @returns {import('./index.js').Push}
 */
export function createNoopPush ({ logger }) {
  return {
    async send (message) {
      logger.info({ recipients: message.tokens.length, type: message.data?.type }, 'push disabled: notification not sent')
      return { sent: 0, failed: 0, invalidTokens: [] }
    }
  }
}
