// Puente entre los servicios y Socket.io: el servicio de mensajes avisa "se creó un mensaje" y el de inscripciones
// "este usuario ya no es parte del plan", sin conocer Socket.io. Se cablea en el container antes de que exista el
// servidor (`attach` llega después del `listen`); hasta entonces, y en los tests HTTP, no hace nada.
// Con el adaptador de Redis, `io.to(sala)` y `io.in(sala).socketsLeave()` alcanzan a los sockets de TODAS las instancias.

export const planRoom = (planId) => `plan:${planId}`
export const userRoom = (userId) => `user:${userId}`

/**
 * @param {object} deps
 * @param {(item: import('../modules/messages/message.service.js').MessageWithSender) => Promise<object>} deps.serializeMessage
 * @param {{ warn: (obj: object, msg: string) => void }} deps.logger
 */
export function createChatBroadcaster ({ serializeMessage, logger }) {
  /** @type {import('socket.io').Server | null} */
  let io = null

  return {
    /** @param {import('socket.io').Server} server */
    attach (server) {
      io = server
    },

    /**
     * Emite `chat:message` a la sala del plan (incluido quien lo mandó: la app fusiona por `id`/`clientId`).
     * Nunca lanza: un fallo del tiempo real no deshace un mensaje ya guardado (la app lo recupera por REST).
     * @param {import('../modules/messages/message.service.js').MessageWithSender} item
     */
    publishMessage (item) {
      if (!io) return
      const server = io
      serializeMessage(item)
        .then((payload) => { server.to(planRoom(item.message.planId)).emit('chat:message', payload) })
        .catch((err) => logger.warn({ err, planId: item.message.planId, messageId: item.message.id }, 'could not broadcast chat message'))
    },

    /**
     * Saca de la sala del plan a todos los sockets del usuario (p. ej. al darse de baja): deja de recibir mensajes
     * aunque su conexión siga abierta.
     * @param {{ planId: string, userId: string }} params
     */
    removeMember ({ planId, userId }) {
      if (!io) return
      try {
        io.in(userRoom(userId)).socketsLeave(planRoom(planId))
      } catch (err) {
        logger.warn({ err, planId, userId }, 'could not remove user from chat room')
      }
    },

    /**
     * Avisa a la sala del plan que un admin ocultó un mensaje (`chat:hidden`): la app lo saca de la lista.
     * Nunca lanza: quien no lo reciba deja de verlo al recargar el historial (solo trae mensajes visibles).
     * @param {{ planId: string, messageId: string }} params
     */
    publishHidden ({ planId, messageId }) {
      if (!io) return
      try {
        io.to(planRoom(planId)).emit('chat:hidden', { planId, messageId })
      } catch (err) {
        logger.warn({ err, planId, messageId }, 'could not broadcast hidden message')
      }
    },

    /**
     * Cierra todas las conexiones de un usuario en todas las instancias (p. ej. cuando un admin lo suspende).
     * Al reconectar, el handshake lo rechaza con ACCOUNT_SUSPENDED.
     * @param {string} userId
     */
    disconnectUser (userId) {
      if (!io) return
      try {
        io.in(userRoom(userId)).disconnectSockets(true)
      } catch (err) {
        logger.warn({ err, userId }, 'could not disconnect user sockets')
      }
    }
  }
}
