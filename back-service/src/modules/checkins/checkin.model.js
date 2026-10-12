// Colección `checkIns` (docs/arquitectura/07-modelo-de-datos.md#checkins).
// NUNCA se persiste la latitud/longitud del participante: solo distancia y precisión.
// `strict: 'throw'` hace que intentar guardar un campo no declarado (p. ej. `location`) falle,
// y el validador $jsonSchema de la migración tiene `additionalProperties: false` como segunda barrera.
// Índices: migrations/20261007120300-create-check-ins.js; validador vigente: 20261013120200-check-ins-method-location.js.
import mongoose from 'mongoose'

// 'location': el creador inscripto, que muestra el QR y no puede escanearlo (sin QR, solo ubicación).
export const CHECKIN_METHODS = Object.freeze(['qr-location', 'location'])

const { ObjectId } = mongoose.Schema.Types

const checkInSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    userId: { type: ObjectId, ref: 'User', required: true },
    // Hora del servidor (clock inyectado), nunca la del cliente.
    checkedInAt: { type: Date, required: true },
    method: { type: String, enum: CHECKIN_METHODS, default: 'qr-location', required: true },
    distanceMeters: { type: Number, required: true, min: 0 },
    accuracyMeters: { type: Number, min: 0 }
  },
  {
    collection: 'checkIns',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    strict: 'throw'
  }
)

export const CheckIn = mongoose.models.CheckIn ?? mongoose.model('CheckIn', checkInSchema)
