// Colección `messages` (docs/arquitectura/07-modelo-de-datos.md#messages).
// Índices y validador $jsonSchema: migrations/20261007120400-create-messages.js y 20261014120000-messages-client-id.js.
import mongoose from 'mongoose'

export const MESSAGE_STATUSES = Object.freeze(['visible', 'hidden'])
// Las notas de voz (decididas, para un PR posterior) suman 'voice' + `audioKey`.
export const MESSAGE_TYPES = Object.freeze(['text'])
export const MESSAGE_TEXT_MAX_LENGTH = 2000
export const CLIENT_ID_MAX_LENGTH = 64

const { ObjectId } = mongoose.Schema.Types

const messageSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    senderId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: 'text', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: MESSAGE_TEXT_MAX_LENGTH },
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
