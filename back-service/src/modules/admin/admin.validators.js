// Esquemas Zod del panel de administración. Solo estados y campos predefinidos: nada del cliente llega a MongoDB
// como filtro (regla 8).
import { cursorField, limitField } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'
import { ADMIN_CATALOGS } from '../catalogs/index.js'
import { REPORT_STATUSES } from '../reports/index.js'

export const idParams = z.strictObject({ id: objectIdField })

export const listReportsQuery = z.strictObject({
  status: z.enum(REPORT_STATUSES).default('pending'),
  limit: limitField,
  cursor: cursorField.optional()
})

export const resolveReportBody = z.strictObject({ status: z.enum(['reviewed', 'dismissed']) })

export const messageStatusBody = z.strictObject({ status: z.enum(['visible', 'hidden']) })

export const userStatusBody = z.strictObject({ status: z.enum(['active', 'suspended']) })

export const catalogParams = z.strictObject({ catalog: z.enum(ADMIN_CATALOGS) })

export const catalogRowParams = z.strictObject({ catalog: z.enum(ADMIN_CATALOGS), id: objectIdField })
