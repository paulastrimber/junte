// La "vista" de un mensaje del chat: la misma para REST y para Socket.io. Lista blanca explícita: `status` y
// `senderId` suelto no salen (el remitente va como vista pública del usuario).

/**
 * @param {object} deps
 * @param {(user: object) => Promise<object>} deps.serializeSender  Vista pública de un usuario (módulo `users`).
 */
export function createMessageSerializer ({ serializeSender }) {
  return {
    /** @param {import('./message.service.js').MessageWithSender} item */
    async serialize ({ message, sender }) {
      return {
        id: message.id,
        planId: message.planId,
        sender: sender ? await serializeSender(sender) : null,
        type: message.type,
        text: message.text,
        clientId: message.clientId,
        createdAt: message.createdAt.toISOString()
      }
    }
  }
}
