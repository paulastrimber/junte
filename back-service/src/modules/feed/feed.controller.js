// Adapta HTTP. La identidad sale del token (req.user.id), nunca del body.

/**
 * @param {object} deps
 * @param {ReturnType<import('./feed.service.js').createFeedService>} deps.feedService
 * @param {{ serializePage: (page: object, viewerId: string) => Promise<object> }} deps.planSerializer  Vista del módulo `plans`.
 * @param {(body: object) => object} deps.pickFilters  Extrae los filtros predefinidos del body ya validado.
 */
export function createFeedController ({ feedService, planSerializer, pickFilters }) {
  return {
    async recommend (req, res) {
      const { near, radiusKm, calendar, limit, cursor } = req.body
      const page = await feedService.recommend({
        userId: req.user.id, near, radiusKm, filters: pickFilters(req.body), calendar, limit, cursor
      })
      // Es una lectura con datos del momento (posición y calendario): no se cachea.
      res.set('Cache-Control', 'no-store')
      res.json(await planSerializer.serializePage(page, req.user.id))
    }
  }
}
