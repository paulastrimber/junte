// Solo método + URL + cadena de middlewares. Se monta bajo `/devices`.
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { deviceTokenParams, registerDeviceBody } from './device.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./device.controller.js').createDeviceController>} deps.deviceController
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createDeviceRoutes ({ deviceController, authenticate }) {
  const router = createRouter()
  router.post('/', authenticate, validate({ body: registerDeviceBody }), deviceController.register)
  router.delete('/:token', authenticate, validate({ params: deviceTokenParams }), deviceController.unregister)
  return router
}
