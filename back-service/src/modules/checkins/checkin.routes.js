// Solo método + URL + cadena de middlewares. Se monta bajo `/plans` (junto al router de planes).
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { checkInBody } from './checkin.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./checkin.controller.js').createCheckInController>} deps.checkInController
 * @param {import('zod').ZodType} deps.planIdParams  Validator de `:id` del módulo `plans`.
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createCheckInRoutes ({ checkInController, planIdParams, authenticate }) {
  const router = createRouter()
  router.post('/:id/check-in', authenticate, validate({ params: planIdParams, body: checkInBody }), checkInController.checkIn)
  return router
}
