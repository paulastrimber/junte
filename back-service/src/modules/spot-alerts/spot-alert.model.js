// Colección `spotAlerts` (docs/arquitectura/07-modelo-de-datos.md#spotalerts): "avisame si se libera un lugar".
// Un pedido por par plan–usuario (índice único `planId_userId_unique`). No hay orden ni lista de espera: al liberarse
// un lugar se avisa a todos los que lo pidieron y el primero que se inscribe se queda con él.
// Índices y validador: migrations/20261104120000-create-spot-alerts.js.
import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const spotAlertSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    userId: { type: ObjectId, ref: 'User', required: true }
  },
  {
    collection: 'spotAlerts',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const SpotAlert = mongoose.models.SpotAlert ?? mongoose.model('SpotAlert', spotAlertSchema)
