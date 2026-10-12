// Solo método + URL + cadena de middlewares.
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { createPlanBody, listPlansQuery, myPlansQuery, planIdParams, setPlanPhotoBody, updatePlanBody } from './plan.validators.js'

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
  router.post('/:id/qr', authenticate, validate({ params: planIdParams }), planController.generateQr)
  return router
}

/**
 * `GET /users/me/plans` ("Mis planes"). Es de este módulo aunque cuelgue de `/users`: el container lo monta ahí.
 * @param {Parameters<typeof createPlanRoutes>[0]} deps
 */
export function createMyPlansRoutes ({ planController, authenticate }) {
  const router = createRouter()
  router.get('/me/plans', authenticate, validate({ query: myPlansQuery }), planController.listMine)
  return router
}
