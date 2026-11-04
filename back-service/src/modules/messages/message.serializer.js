// La "vista" de un mensaje del chat: la misma para REST y para Socket.io. Lista blanca explícita: `status` y
// `senderId` suelto no salen (el remitente va como vista pública del usuario).

// Notas de voz: `audioKey` no sale; va `audioUrl` (GET firmada de corta duración) y `durationMs`, con `text: null`.
import { READ_URL_TTL_SECONDS } from '../../shared/uploads.js'

/**
 * @param {object} deps
 * @param {(user: object) => Promise<object>} deps.serializeSender  Vista pública de un usuario (módulo `users`).
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 */
export function createMessageSerializer ({ serializeSender, storage }) {
  return {
    /** @param {import('./message.service.js').MessageWithSender} item */
    async serialize ({ message, sender }) {
      const voice = message.type === 'voice'
        ? {
            audioUrl: message.audioKey ? await storage.presignDownload({ key: message.audioKey, expiresInSeconds: READ_URL_TTL_SECONDS }) : null,
            durationMs: message.durationMs
          }
        : {}
      return {
        id: message.id,
        planId: message.planId,
        sender: sender ? await serializeSender(sender) : null,
        type: message.type,
        text: message.text,
        ...voice,
        clientId: message.clientId,
        createdAt: message.createdAt.toISOString()
      }
    }
  }
}
