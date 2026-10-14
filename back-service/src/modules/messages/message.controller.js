// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {object} deps
 * @param {ReturnType<import('./message.service.js').createMessageService>} deps.messageService
 * @param {ReturnType<import('./message.serializer.js').createMessageSerializer>} deps.messageSerializer
 */
export function createMessageController ({ messageService, messageSerializer }) {
  return {
    async list (req, res) {
      const { limit, cursor } = req.query
      const { items, nextCursor } = await messageService.list({ planId: req.params.id, userId: req.user.id, limit, cursor })
      res.set('Cache-Control', 'no-store')
      res.json({ items: await Promise.all(items.map(messageSerializer.serialize)), nextCursor })
    },

    async send (req, res) {
      const { text, clientId } = req.body
      const { created, ...item } = await messageService.send({ planId: req.params.id, userId: req.user.id, text, clientId })
      // 200 si es el reintento de un mensaje que ya existía (mismo `clientId`): no se creó otro.
      res.status(created ? 201 : 200).json(await messageSerializer.serialize(item))
    }
  }
}
