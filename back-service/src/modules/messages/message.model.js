// Colección `messages` (docs/arquitectura/07-modelo-de-datos.md#messages).
// Índices y validador $jsonSchema: migrations/20261007120400-create-messages.js y 20261014120000-messages-client-id.js.
import mongoose from 'mongoose'

export const MESSAGE_STATUSES = Object.freeze(['visible', 'hidden'])
// Notas de voz (S5-BE-09): `type: 'voice'` + `audioKey` (S3, por el flujo de uploads/presign) + `durationMs`, sin texto.
export const MESSAGE_TYPES = Object.freeze(['text', 'voice'])
export const MESSAGE_TEXT_MAX_LENGTH = 2000
export const CLIENT_ID_MAX_LENGTH = 64

const { ObjectId } = mongoose.Schema.Types

const messageSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    senderId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: 'text', required: true },
    // Obligatorio en los de texto; una nota de voz no lleva texto.
    text: { type: String, required: function () { return this.type !== 'voice' }, trim: true, minlength: 1, maxlength: MESSAGE_TEXT_MAX_LENGTH },
    // Solo notas de voz: clave del audio en S3 (nunca sale en una respuesta: va la URL firmada) y duración que informa la app.
    audioKey: { type: String },
    durationMs: { type: Number, min: 1 },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'visible', required: true },
    // Lo genera el teléfono para que un reintento no duplique el mensaje (índice único parcial { senderId, clientId }).
    clientId: { type: String, maxlength: CLIENT_ID_MAX_LENGTH }
  },
  {
    collection: 'messages',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const Message = mongoose.models.Message ?? mongoose.model('Message', messageSchema)
