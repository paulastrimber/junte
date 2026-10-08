// Colección `planParticipants` (docs/arquitectura/07-modelo-de-datos.md#planparticipants).
// Un único registro por par plan–usuario (índice único `planId_userId_unique`); una baja lo pasa a
// `cancelled` y una nueva inscripción lo reactiva.
// Índices y validador $jsonSchema: migrations/20261007120200-create-plan-participants.js.
import mongoose from 'mongoose'

export const PARTICIPATION_STATUSES = Object.freeze(['active', 'cancelled'])

const { ObjectId } = mongoose.Schema.Types

const participationSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    userId: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: PARTICIPATION_STATUSES, default: 'active', required: true },
    joinedAt: { type: Date, required: true },
    cancelledAt: { type: Date },
    // Solo-backend: se marcan al cerrar/completar el plan si no hubo check-in.
    noShow: { type: Boolean, default: false, required: true },
    noShowAt: { type: Date }
  },
  {
    collection: 'planParticipants',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const Participation = mongoose.models.Participation ??
  mongoose.model('Participation', participationSchema)
