// Colección `sessions` (docs/arquitectura/07-modelo-de-datos.md#sessions): una por dispositivo/login.
// Índices y validador: migrations/20261011180000-create-sessions.js (nunca por autoIndex).
import mongoose from 'mongoose'

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Identificador público de la sesión (va dentro de los tokens). Único.
    sid: { type: String, required: true },
    // sha256 (hex) del refresh token vigente. Nunca el token.
    refreshTokenHash: { type: String, required: true },
    deviceLabel: { type: String, trim: true, maxlength: 60 },
    lastUsedAt: { type: Date, required: true },
    // El índice TTL borra la sesión al llegar acá.
    expiresAt: { type: Date, required: true },
    // Sin valor mientras la sesión está activa.
    revokedAt: { type: Date }
  },
  { collection: 'sessions', timestamps: true, autoIndex: false, autoCreate: false }
)

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema)
