// Solo método + URL + cadena de middlewares. El rate limit estricto de login/register lo aplica Nginx.
import { createRouter } from '../../shared/router.js'
import { validate } from '../../middlewares/validate.js'
import { loginBody, refreshBody, registerBody } from './auth.validators.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./auth.controller.js').createAuthController>} deps.authController
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createAuthRoutes ({ authController, authenticate }) {
  const router = createRouter()
  router.post('/register', validate({ body: registerBody }), authController.register)
  router.post('/login', validate({ body: loginBody }), authController.login)
  router.post('/refresh', validate({ body: refreshBody }), authController.refresh)
  router.post('/logout', authenticate, authController.logout)
  router.post('/logout-all', authenticate, authController.logoutAll)
  return router
}
