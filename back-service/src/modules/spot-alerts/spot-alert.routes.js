// Solo método + URL + cadena de middlewares. Se monta bajo `/plans` (junto al router de planes).
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { emptyBody } from './spot-alert.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./spot-alert.controller.js').createSpotAlertController>} deps.spotAlertController
 * @param {import('zod').ZodType} deps.planIdParams  Validator de `:id` del módulo `plans`.
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createSpotAlertRoutes ({ spotAlertController, planIdParams, authenticate }) {
  const router = createRouter()
  router.put('/:id/spot-alert', authenticate, validate({ params: planIdParams, body: emptyBody }), spotAlertController.request)
  router.delete('/:id/spot-alert', authenticate, validate({ params: planIdParams, body: emptyBody }), spotAlertController.cancel)
  return router
}
