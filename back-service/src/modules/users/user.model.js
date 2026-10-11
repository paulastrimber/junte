// Colección `users` (docs/arquitectura/07-modelo-de-datos.md#users).
// Índices y validador $jsonSchema: migrations/20261007120000-create-users.js (nunca por autoIndex).
import mongoose from 'mongoose'

export const USER_ROLES = Object.freeze(['user', 'admin'])
export const USER_STATUSES = Object.freeze(['active', 'suspended'])

// Campos que nunca salen del back aunque alguien serialice el documento entero.
const HIDDEN_FIELDS = ['passwordHash']

function hideSecrets (_doc, ret) {
  for (const field of HIDDEN_FIELDS) delete ret[field]
  return ret
}

const userSchema = new mongoose.Schema(
  {
    // Único (índice `email_unique`), normalizado.
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
    // Día del calendario (sin hora) guardado a medianoche UTC. La edad no se guarda: se calcula.
    birthDate: { type: Date },
    // Claves de los catálogos (o `other`), todas opcionales: no todo usuario estudia, ni todos completan el onboarding.
    university: { type: String, trim: true },
    career: { type: String, trim: true },
    city: { type: String, trim: true },
    neighborhood: { type: String, trim: true },
    interests: { type: [String], default: [] },
    // Solo-backend (ADR-0004): cambian por migración/seed o por otro admin.
    role: { type: String, enum: USER_ROLES, default: 'user', required: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true },
    // Solo-backend: +1 por check-in válido, dentro de la transacción del check-in.
    reputation: { type: Number, default: 0 },
    photoKey: { type: String },
    // Se completa cuando la persona termina o abandona el onboarding (no vuelve a aparecer).
    onboardingCompletedAt: { type: Date }
  },
  {
    collection: 'users',
    timestamps: true,
    autoIndex: false,
    autoCreate: false,
    // Solo toJSON: toObject/lean siguen trayendo el hash para que auth pueda verificarlo.
    // La "vista" real es el serializer; esto es una red de seguridad.
    toJSON: { transform: hideSecrets }
  }
)

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)
