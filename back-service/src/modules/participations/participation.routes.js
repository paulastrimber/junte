// Solo método + URL + cadena de middlewares. Se monta bajo `/plans` (junto al router de planes).
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { emptyBody, listParticipantsQuery } from './participation.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./participation.controller.js').createParticipationController>} deps.participationController
 * @param {import('zod').ZodType} deps.planIdParams  Validator de `:id` del módulo `plans`.
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createParticipationRoutes ({ participationController, planIdParams, authenticate }) {
  const router = createRouter()
  router.post('/:id/join', authenticate, validate({ params: planIdParams, body: emptyBody }), participationController.join)
  router.delete('/:id/join', authenticate, validate({ params: planIdParams, body: emptyBody }), participationController.leave)
  router.get('/:id/participants', authenticate, validate({ params: planIdParams, query: listParticipantsQuery }), participationController.listParticipants)
  return router
}
