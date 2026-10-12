// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {object} deps
 * @param {ReturnType<import('./participation.service.js').createParticipationService>} deps.participationService
 * @param {(user: object) => Promise<object>} deps.serializeParticipant  Vista pública de un usuario (módulo `users`).
 */
export function createParticipationController ({ participationService, serializeParticipant }) {
  return {
    async join (req, res) {
      const participation = await participationService.join({ planId: req.params.id, userId: req.user.id })
      res.status(201).json({ planId: participation.planId, status: participation.status, joinedAt: participation.joinedAt.toISOString() })
    },

    async leave (req, res) {
      await participationService.leave({ planId: req.params.id, userId: req.user.id })
      res.status(204).end()
    },

    async listParticipants (req, res) {
      const { limit, cursor } = req.query
      const { items, nextCursor } = await participationService.listParticipants({ planId: req.params.id, userId: req.user.id, limit, cursor })
      res.json({ items: await Promise.all(items.map(serializeParticipant)), nextCursor })
    }
  }
}
