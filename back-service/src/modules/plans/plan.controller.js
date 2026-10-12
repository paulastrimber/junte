// Adapta HTTP: lee la request ya validada, llama al servicio y pasa por el serializer.
// La identidad sale del token (req.user.id), nunca del body.
import { pickFilters } from './plan.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./plan.service.js').createPlanService>} deps.planService
 * @param {ReturnType<import('./plan.serializer.js').createPlanSerializer>} deps.planSerializer
 * @param {{ recommend: (params: object) => Promise<{ items: object[], nextCursor: string | null }> }} deps.feedService
 *   Ranking por cercanía (módulo `feed`): lo usa `GET /plans?near=`.
 */
export function createPlanController ({ planService, planSerializer, feedService }) {
  return {
    async create (req, res) {
      const item = await planService.create({ creatorId: req.user.id, data: req.body })
      res.status(201).json(await planSerializer.serialize(item, req.user.id))
    },

    async get (req, res) {
      const item = await planService.getVisible({ planId: req.params.id, userId: req.user.id })
      res.json(await planSerializer.serialize(item, req.user.id))
    },

    async update (req, res) {
      const item = await planService.update({ planId: req.params.id, userId: req.user.id, changes: req.body })
      res.json(await planSerializer.serialize(item, req.user.id))
    },

    async setPhoto (req, res) {
      const item = await planService.setPhoto({ planId: req.params.id, userId: req.user.id, objectKey: req.body.objectKey })
      res.json(await planSerializer.serialize(item, req.user.id))
    },

    async list (req, res) {
      const { near, radiusKm, limit, cursor } = req.query
      const filters = pickFilters(req.query)
      const page = near
        ? await feedService.recommend({ userId: req.user.id, near, radiusKm, filters, limit, cursor })
        : await planService.list({ userId: req.user.id, filters, limit, cursor })
      res.json(await planSerializer.serializePage(page, req.user.id))
    },

    filters (req, res) {
      res.json(planService.getFilterOptions())
    },

    async generateQr (req, res) {
      const { qrToken, expiresAt } = await planService.generateQr({ planId: req.params.id, userId: req.user.id })
      // Es una credencial de corta vida: que ningún intermediario la guarde.
      res.set('Cache-Control', 'no-store')
      res.status(201).json({ qrToken, expiresAt: expiresAt.toISOString() })
    },

    async listMine (req, res) {
      const { role, when, limit, cursor } = req.query
      const page = await planService.listMine({ userId: req.user.id, role, when, limit, cursor })
      res.json(await planSerializer.serializePage(page, req.user.id))
    }
  }
}
