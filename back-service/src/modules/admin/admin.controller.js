// Adapta HTTP: lee la request ya validada y llama al servicio. Quien opera sale del token (req.user.id).
import { serializeCatalogRow } from '../catalogs/index.js'
import { serializeAdminMessage, serializeAdminUser, serializeMetrics, serializeReportItem } from './admin.serializer.js'

/**
 * @param {{ adminService: ReturnType<import('./admin.service.js').createAdminService> }} deps
 */
export function createAdminController ({ adminService }) {
  // Nada del panel se cachea (ni en el teléfono ni en un proxy): son datos de moderación.
  const noStore = (res) => res.set('Cache-Control', 'no-store')

  return {
    async listReports (req, res) {
      const { status, limit, cursor } = req.query
      const { items, nextCursor } = await adminService.listReports({ adminId: req.user.id, status, limit, cursor })
      noStore(res).json({ items: items.map(serializeReportItem), nextCursor })
    },

    async resolveReport (req, res) {
      const { item, resolvedCount } = await adminService.resolveReport({ adminId: req.user.id, reportId: req.params.id, status: req.body.status })
      noStore(res).json({ ...serializeReportItem(item), resolvedCount })
    },

    async setMessageStatus (req, res) {
      const result = await adminService.setMessageStatus({ adminId: req.user.id, messageId: req.params.id, status: req.body.status })
      noStore(res).json(serializeAdminMessage(result))
    },

    async setUserStatus (req, res) {
      const user = await adminService.setUserStatus({ adminId: req.user.id, userId: req.params.id, status: req.body.status })
      noStore(res).json(serializeAdminUser(user))
    },

    async getMetrics (req, res) {
      noStore(res).json(serializeMetrics(await adminService.getMetrics({ adminId: req.user.id })))
    },

    async listCatalog (req, res) {
      const { catalog } = req.params
      const rows = await adminService.listCatalog({ adminId: req.user.id, catalog })
      noStore(res).json({ items: rows.map((row) => serializeCatalogRow(catalog, row)) })
    },

    async createCatalogRow (req, res) {
      const { catalog } = req.params
      const row = await adminService.createCatalogRow({ adminId: req.user.id, catalog, data: req.body })
      noStore(res).status(201).json(serializeCatalogRow(catalog, row))
    },

    async updateCatalogRow (req, res) {
      const { catalog, id } = req.params
      const row = await adminService.updateCatalogRow({ adminId: req.user.id, catalog, id, changes: req.body })
      noStore(res).json(serializeCatalogRow(catalog, row))
    }
  }
}
