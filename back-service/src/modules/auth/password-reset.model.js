// Colección `passwordResets` (docs/arquitectura/07-modelo-de-datos.md#passwordresets): un pedido de recuperación de
// contraseña por usuario. Índices y validador: migrations/20261115120000-create-password-resets.js (nunca por autoIndex).
import mongoose from 'mongoose'

const passwordResetSchema = new mongoose.Schema(
  {
    // Único: pedir otro código reemplaza al anterior.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // HMAC-SHA256 (hex) del código vigente. Nunca el código.
    codeHash: { type: String, required: true },
    // Hasta cuándo vale el código.
    expiresAt: { type: Date, required: true },
    // Intentos hechos con el código vigente (acertados o no).
    attempts: { type: Number, required: true, default: 0 },
    // Códigos pedidos en la ventana actual y cuándo salió el último.
    requestCount: { type: Number, required: true, default: 1 },
    lastSentAt: { type: Date, required: true },
    // Fin de la ventana de pedidos: el índice TTL borra el documento al llegar acá.
    windowEndsAt: { type: Date, required: true }
  },
  { collection: 'passwordResets', timestamps: true, autoIndex: false, autoCreate: false }
)

export const PasswordReset = mongoose.models.PasswordReset ?? mongoose.model('PasswordReset', passwordResetSchema)
