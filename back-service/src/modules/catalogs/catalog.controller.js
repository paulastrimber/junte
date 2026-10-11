/**
 * @param {{ catalogService: ReturnType<import('./catalog.service.js').createCatalogService> }} deps
 */
export function createCatalogController ({ catalogService }) {
  return {
    async get (req, res) {
      // Cambia poco: la app puede reutilizarlo unos minutos (y usar `version` como clave de caché).
      res.set('Cache-Control', 'private, max-age=300')
      res.json(await catalogService.getPublicCatalog())
    }
  }
}
