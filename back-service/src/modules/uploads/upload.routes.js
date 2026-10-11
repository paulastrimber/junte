import { createRouter } from '../../shared/router.js'
import { validate } from '../../middlewares/validate.js'
import { presignBody } from './upload.validators.js'

/**
 * @param {{ uploadController: ReturnType<import('./upload.controller.js').createUploadController>, authenticate: import('express').RequestHandler }} deps
 */
export function createUploadRoutes ({ uploadController, authenticate }) {
  const router = createRouter()
  router.post('/presign', authenticate, validate({ body: presignBody }), uploadController.presign)
  return router
}
