// Solo método + URL + cadena de middlewares.
import { createRouter } from '../../shared/router.js'
import { validate } from '../../middlewares/validate.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./user.controller.js').createUserController>} deps.userController
 * @param {ReturnType<import('./user.validators.js').createUserValidators>} deps.validators
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createUserRoutes ({ userController, validators, authenticate }) {
  const router = createRouter()
  router.get('/me', authenticate, userController.getMe)
  router.put('/me', authenticate, validate({ body: validators.updateProfileBody }), userController.updateMe)
  router.put('/me/photo', authenticate, validate({ body: validators.setPhotoBody }), userController.setPhoto)
  return router
}
