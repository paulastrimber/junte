// Solo método + URL + cadena de middlewares. Todo /admin/* exige sesión y rol admin (primera barrera; el servicio lo
// vuelve a comprobar). Un usuario común recibe 403 en cualquier ruta, exista o no.
import { requireRole } from '../../middlewares/requireRole.js'
import { validate } from '../../middlewares/validate.js'
import { createRouter } from '../../shared/router.js'
import { CATALOG_BODIES } from '../catalogs/index.js'
import {
  catalogParams, catalogRowParams, idParams, listReportsQuery, messageStatusBody, resolveReportBody, userStatusBody
} from './admin.validators.js'

/**
 * El esquema del body depende del catálogo: va después de validar `:catalog`.
 * @param {'create' | 'update'} kind
 * @returns {import('express').RequestHandler}
 */
function validateCatalogBody (kind) {
  return function validateCatalogRequest (req, res, next) {
    req.body = CATALOG_BODIES[req.params.catalog][kind].parse(req.body ?? {})
    next()
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./admin.controller.js').createAdminController>} deps.adminController
 * @param {import('express').RequestHandler} deps.authenticate
 */
export function createAdminRoutes ({ adminController, authenticate }) {
  const router = createRouter()
  router.use(authenticate, requireRole('admin'))

  router.get('/reports', validate({ query: listReportsQuery }), adminController.listReports)
  router.patch('/reports/:id', validate({ params: idParams, body: resolveReportBody }), adminController.resolveReport)
  router.patch('/messages/:id', validate({ params: idParams, body: messageStatusBody }), adminController.setMessageStatus)
  router.patch('/users/:id', validate({ params: idParams, body: userStatusBody }), adminController.setUserStatus)
  router.get('/metrics', adminController.getMetrics)

  router.get('/catalogs/:catalog', validate({ params: catalogParams }), adminController.listCatalog)
  router.post('/catalogs/:catalog', validate({ params: catalogParams }), validateCatalogBody('create'), adminController.createCatalogRow)
  router.patch('/catalogs/:catalog/:id', validate({ params: catalogRowParams }), validateCatalogBody('update'), adminController.updateCatalogRow)
  return router
}
