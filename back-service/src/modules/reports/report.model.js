// Colección `reports` (docs/arquitectura/07-modelo-de-datos.md#reports).
// Nunca visibles para otros usuarios. Índices y validador: migrations/20261007120500-create-reports.js y
// 20261014130000-reports-reasons-and-resolution.js.
import mongoose from 'mongoose'

export const REPORT_TARGET_TYPES = Object.freeze(['user', 'plan', 'message'])
export const REPORT_STATUSES = Object.freeze(['pending', 'reviewed', 'dismissed'])
// Motivos fijos (decidido en S6): la app muestra el texto de cada uno; `other` exige descripción.
export const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'inappropriate', 'scam', 'other'])
export const REPORT_DESCRIPTION_MAX_LENGTH = 500

const { ObjectId } = mongoose.Schema.Types

const reportSchema = new mongoose.Schema(
  {
    // Siempre del token.
    reporterId: { type: ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: ObjectId, required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, trim: true, maxlength: REPORT_DESCRIPTION_MAX_LENGTH },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending', required: true },
    // Quién y cuándo lo resolvió (solo el panel de administración).
    resolvedBy: { type: ObjectId, ref: 'User' },
    resolvedAt: { type: Date }
  },
  {
    collection: 'reports',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema)
