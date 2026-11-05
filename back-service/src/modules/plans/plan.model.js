// Colección `plans` (docs/arquitectura/07-modelo-de-datos.md#plans).
// Índices: migrations/20261007120100-create-plans.js; validador $jsonSchema vigente:
// migrations/20261013120100-plans-validator-check-in.js (nunca por autoIndex).
import mongoose from 'mongoose'
import { ATTENDANCE } from '../../shared/attendance.js'
import { PLAN_LIMITS } from './plan.rules.js'

export const PLAN_STATUSES = Object.freeze(['open', 'closed', 'cancelled', 'completed'])

const { ObjectId } = mongoose.Schema.Types

function hideSecrets (_doc, ret) {
  delete ret.qrNonceHash
  delete ret.qrPreviousNonceHash
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
    label: { type: String, trim: true, required: true, minlength: 1, maxlength: PLAN_LIMITS.LABEL_MAX },
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
    title: { type: String, required: true, trim: true, minlength: PLAN_LIMITS.TITLE_MIN, maxlength: PLAN_LIMITS.TITLE_MAX },
    description: { type: String, trim: true, maxlength: PLAN_LIMITS.DESCRIPTION_MAX },
    startsAt: { type: Date, required: true },
    // Posterior a startsAt y como máximo MAX_DURATION_MS después (lo valida el servicio y la migración).
    endsAt: { type: Date, required: true },
    location: { type: locationSchema, required: true },
    // Keys del catálogo `interests` (de 1 a 10): se usan en el Jaccard del feed.
    interests: { type: [String], default: [] },
    // Solo-backend: se deriva del perfil del creador.
    university: { type: String, trim: true },
    // Entero de 1 a 500, o null = cupo ilimitado (un plan sin límite nunca está lleno).
    capacity: {
      type: Number,
      default: null,
      min: 1,
      max: PLAN_LIMITS.CAPACITY_MAX,
      validate: { validator: (value) => value === null || Number.isInteger(value), message: 'capacity debe ser entero' }
    },
    // Costo en pesos uruguayos (entero). 0 = gratis.
    price: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: PLAN_LIMITS.PRICE_MAX,
      validate: { validator: Number.isInteger, message: 'price debe ser entero' }
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
    // Solo-backend: la ventana se calcula a partir de startsAt/endsAt (shared/attendance.js).
    checkInOpensAt: { type: Date, required: true },
    checkInClosesAt: { type: Date, required: true },
    // Lo único del check-in que elige el creador.
    checkInRadiusMeters: {
      type: Number,
      required: true,
      default: ATTENDANCE.RADIUS_DEFAULT_METERS,
      min: ATTENDANCE.RADIUS_MIN_METERS,
      max: ATTENDANCE.RADIUS_MAX_METERS
    },
    // Desafío QR vigente: SHA-256 del nonce, nunca el nonce.
    qrNonceHash: { type: String },
    qrExpiresAt: { type: Date },
    // Desafío anterior: sigue valiendo unos segundos después de renovarlo (ATTENDANCE.QR_PREVIOUS_GRACE_MS).
    qrPreviousNonceHash: { type: String },
    qrPreviousExpiresAt: { type: Date },
    // Solo-backend: cuándo el job cerró la asistencia (noShow y +1 del creador). Se escribe una sola vez.
    attendanceClosedAt: { type: Date },
    // Solo-backend (S5-BE-08): cuándo el job mandó el recordatorio. Se escribe una sola vez; cambiar `startsAt` lo borra.
    reminderSentAt: { type: Date }
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
