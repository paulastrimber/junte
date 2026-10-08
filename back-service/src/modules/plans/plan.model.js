// Colección `plans` (docs/arquitectura/07-modelo-de-datos.md#plans).
// Índices y validador $jsonSchema: migrations/20261007120100-create-plans.js (nunca por autoIndex).
import mongoose from 'mongoose'

export const PLAN_STATUSES = Object.freeze(['open', 'closed', 'cancelled', 'completed'])

const { ObjectId } = mongoose.Schema.Types

function hideSecrets (_doc, ret) {
  delete ret.qrNonceHash
  return ret
}

function isLngLat (coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false
  const [lng, lat] = coordinates
  return Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

// GeoJSON Point. Orden obligatorio: [lng, lat].
const locationSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: { validator: isLngLat, message: 'coordinates debe ser [lng, lat] dentro de rango' }
    }
  },
  { _id: false }
)

const planSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    startsAt: { type: Date, required: true },
    location: { type: locationSchema, required: true },
    interests: { type: [String], default: [] },
    // Solo-backend: se deriva del perfil del creador.
    university: { type: String, trim: true },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'capacity debe ser entero' }
    },
    // Solo-backend: se modifica junto con planParticipants, en la misma transacción.
    participantCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: [
        { validator: Number.isInteger, message: 'participantCount debe ser entero' },
        {
          validator: function (value) { return this.capacity == null || value <= this.capacity },
          message: 'participantCount no puede superar capacity'
        }
      ]
    },
    // Siempre del token.
    creatorId: { type: ObjectId, ref: 'User', required: true },
    status: { type: String, enum: PLAN_STATUSES, default: 'open', required: true },
    photoKey: { type: String },
    checkInOpensAt: { type: Date },
    checkInClosesAt: { type: Date },
    checkInRadiusMeters: { type: Number, min: 1 },
    // Desafío QR vigente: SHA-256 del nonce, nunca el nonce.
    qrNonceHash: { type: String },
    qrExpiresAt: { type: Date }
  },
  {
    collection: 'plans',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    toJSON: { transform: hideSecrets }
  }
)

export const Plan = mongoose.models.Plan ?? mongoose.model('Plan', planSchema)
