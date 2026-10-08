// Colección `messages` (docs/arquitectura/07-modelo-de-datos.md#messages).
// Índices y validador $jsonSchema: migrations/20261007120400-create-messages.js.
import mongoose from 'mongoose'

export const MESSAGE_STATUSES = Object.freeze(['visible', 'hidden'])
export const MESSAGE_TEXT_MAX_LENGTH = 2000

const { ObjectId } = mongoose.Schema.Types

const messageSchema = new mongoose.Schema(
  {
    planId: { type: ObjectId, ref: 'Plan', required: true },
    // Siempre del token.
    senderId: { type: ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: MESSAGE_TEXT_MAX_LENGTH },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'visible', required: true }
  },
  {
    collection: 'messages',
    timestamps: true,
    autoIndex: false,
    autoCreate: false
  }
)

export const Message = mongoose.models.Message ?? mongoose.model('Message', messageSchema)
