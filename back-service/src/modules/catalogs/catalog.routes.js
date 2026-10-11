import { createRouter } from '../../shared/router.js'

/**
 * @param {{ catalogController: ReturnType<import('./catalog.controller.js').createCatalogController>, authenticate: import('express').RequestHandler }} deps
 */
export function createCatalogRoutes ({ catalogController, authenticate }) {
  const router = createRouter()
  router.get('/', authenticate, catalogController.get)
  return router
}
