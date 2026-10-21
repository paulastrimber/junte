// Solo método + URL + cadena de middlewares. Los reportes nunca se listan para usuarios: eso es del panel (/admin).
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { createReportBody } from './report.validators.js'

/**
 * @param {{ reportController: ReturnType<import('./report.controller.js').createReportController>, authenticate: import('express').RequestHandler }} deps
 */
export function createReportRoutes ({ reportController, authenticate }) {
  const router = createRouter()
  router.post('/', authenticate, validate({ body: createReportBody }), reportController.create)
  return router
}
