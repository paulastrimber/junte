// Colección `deviceTokens` (docs/arquitectura/07-modelo-de-datos.md#devicetokens).
// Un registro por token FCM (índice único `token_unique`); se eliminan los que FCM informa como inválidos.
// Índices y validador: migrations/20261007120600-create-device-tokens.js.
import mongoose from 'mongoose'

export const DEVICE_PLATFORMS = Object.freeze(['android', 'ios'])

const { ObjectId } = mongoose.Schema.Types

const deviceTokenSchema = new mongoose.Schema(
  {
    // Siempre del token de acceso.
    userId: { type: ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: DEVICE_PLATFORMS, required: true }
  },
  {
    collection: 'deviceTokens',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const DeviceToken = mongoose.models.DeviceToken ??
  mongoose.model('DeviceToken', deviceTokenSchema)
