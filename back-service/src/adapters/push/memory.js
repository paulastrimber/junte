// Push en memoria para desarrollo local y tests: no sale nada del proceso. `sent` guarda lo que se habría enviado.
// `invalidTokens` simula los tokens que FCM rechazaría (para probar que se borran).

/**
 * @param {{ invalidTokens?: Iterable<string> }} [options]
 * @returns {import('./index.js').Push & { sent: import('./index.js').PushMessage[], invalidTokens: Set<string> }}
 */
export function createMemoryPush ({ invalidTokens = [] } = {}) {
  const invalid = new Set(invalidTokens)
  const sent = []
  return {
    sent,
    invalidTokens: invalid,
    async send (message) {
      const rejected = message.tokens.filter((token) => invalid.has(token))
      const delivered = message.tokens.filter((token) => !invalid.has(token))
      if (delivered.length > 0) sent.push({ ...message, tokens: delivered })
      return { sent: delivered.length, failed: 0, invalidTokens: rejected }
    }
  }
}
