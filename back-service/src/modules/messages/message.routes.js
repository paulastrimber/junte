// Solo método + URL + cadena de middlewares. Se monta bajo `/plans` (junto al router de planes).
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { listMessagesQuery, sendMessageBody } from './message.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./message.controller.js').createMessageController>} deps.messageController
 * @param {import('zod').ZodType} deps.planIdParams  Validator de `:id` del módulo `plans`.
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createMessageRoutes ({ messageController, planIdParams, authenticate }) {
  const router = createRouter()
  router.get('/:id/messages', authenticate, validate({ params: planIdParams, query: listMessagesQuery }), messageController.list)
  router.post('/:id/messages', authenticate, validate({ params: planIdParams, body: sendMessageBody }), messageController.send)
  return router
}
