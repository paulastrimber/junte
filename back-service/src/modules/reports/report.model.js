// Colección `reports` (docs/arquitectura/07-modelo-de-datos.md#reports).
// Nunca visibles para otros usuarios. Índices y validador: migrations/20261007120500-create-reports.js.
import mongoose from 'mongoose'

export const REPORT_TARGET_TYPES = Object.freeze(['user', 'plan', 'message'])
export const REPORT_STATUSES = Object.freeze(['pending', 'reviewed', 'dismissed'])

const { ObjectId } = mongoose.Schema.Types

const reportSchema = new mongoose.Schema(
  {
    // Siempre del token.
    reporterId: { type: ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: ObjectId, required: true },
    reason: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending', required: true }
  },
  {
    collection: 'reports',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema)
