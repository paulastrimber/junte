import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { feedBody } from './feed.validators.js'

/**
 * @param {{ feedController: ReturnType<import('./feed.controller.js').createFeedController>, authenticate: import('express').RequestHandler }} deps
 */
export function createFeedRoutes ({ feedController, authenticate }) {
  const router = createRouter()
  router.post('/', authenticate, validate({ body: feedBody }), feedController.recommend)
  return router
}
