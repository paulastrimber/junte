// Solo método + URL + cadena de middlewares.
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { createPlanBody, listPlansQuery, planIdParams, setPlanPhotoBody, updatePlanBody } from './plan.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./plan.controller.js').createPlanController>} deps.planController
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createPlanRoutes ({ planController, authenticate }) {
  const router = createRouter()
  router.get('/', authenticate, validate({ query: listPlansQuery }), planController.list)
  router.post('/', authenticate, validate({ body: createPlanBody }), planController.create)
  // Antes de `/:id`: "filters" no es un ID.
  router.get('/filters', authenticate, planController.filters)
  router.get('/:id', authenticate, validate({ params: planIdParams }), planController.get)
  router.patch('/:id', authenticate, validate({ params: planIdParams, body: updatePlanBody }), planController.update)
  router.put('/:id/photo', authenticate, validate({ params: planIdParams, body: setPlanPhotoBody }), planController.setPhoto)
  return router
}
