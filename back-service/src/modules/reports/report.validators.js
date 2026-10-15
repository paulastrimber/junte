// Esquemas Zod de los reportes. La identidad sale del token: `reporterId` (o `status`) en el body es 400 (strict).
import { objectIdField, z } from '../../shared/validation.js'
import { REPORT_DESCRIPTION_MAX_LENGTH, REPORT_REASONS, REPORT_TARGET_TYPES } from './report.model.js'

// Vacía o de solo espacios cuenta como "sin descripción".
const descriptionField = z.string().trim().max(REPORT_DESCRIPTION_MAX_LENGTH)
  .transform((text) => (text === '' ? undefined : text))

export const createReportBody = z.strictObject({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: objectIdField,
  reason: z.enum(REPORT_REASONS),
  description: descriptionField.optional()
}).refine((body) => body.reason !== 'other' || body.description !== undefined, {
  path: ['description'],
  error: 'Contanos qué pasó cuando el motivo es "otro"'
})
