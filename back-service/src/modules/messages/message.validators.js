// Esquemas Zod del chat. Los usan REST y Socket.io (mismas reglas por los dos caminos). La identidad sale del token:
// `senderId` en un body es 400 (strict).
import { cursorField, limitField } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'
import { AUDIO_KEY_PATTERN, VOICE_MAX_DURATION_MS } from '../../shared/uploads.js'
import { CLIENT_ID_MAX_LENGTH, MESSAGE_TEXT_MAX_LENGTH, MESSAGE_TYPES } from './message.model.js'

// Se recorta antes de medir: un texto de solo espacios es vacío.
const textField = z.string().trim().min(1).max(MESSAGE_TEXT_MAX_LENGTH)

// Clave de idempotencia que genera el teléfono (no es un secreto). Solo caracteres seguros para logs y URLs.
const clientIdField = z.string().min(1).max(CLIENT_ID_MAX_LENGTH).regex(/^[A-Za-z0-9_-]+$/, { error: 'El identificador del mensaje no es válido' })

export const listMessagesQuery = z.strictObject({
  limit: limitField,
  cursor: cursorField.optional()
})

// Un mensaje es de texto (`text`) o una nota de voz (`type: 'voice'`, `audioKey` de uploads/presign y `durationMs`).
// Sin `type` es texto (así lo mandaba la app antes de las notas de voz).
const messageFields = {
  type: z.enum(MESSAGE_TYPES).optional(),
  text: textField.optional(),
  audioKey: z.string().regex(AUDIO_KEY_PATTERN, { error: 'La clave del audio no es válida' }).optional(),
  durationMs: z.int().min(1).max(VOICE_MAX_DURATION_MS).optional(),
  clientId: clientIdField.optional()
}

function checkContent (message, ctx) {
  const issue = (path, text) => ctx.addIssue({ code: 'custom', path: [path], message: text })
  if ((message.type ?? 'text') === 'text') {
    if (message.text === undefined) issue('text', 'Escribí un mensaje')
    if (message.audioKey !== undefined) issue('audioKey', 'Solo las notas de voz llevan audio')
    if (message.durationMs !== undefined) issue('durationMs', 'Solo las notas de voz llevan duración')
    return
  }
  if (message.text !== undefined) issue('text', 'Una nota de voz no lleva texto')
  if (message.audioKey === undefined) issue('audioKey', 'Falta el audio de la nota de voz')
  if (message.durationMs === undefined) issue('durationMs', 'Falta la duración de la nota de voz')
}

const withType = (message) => ({ ...message, type: message.type ?? 'text' })

export const sendMessageBody = z.strictObject(messageFields).superRefine(checkContent).transform(withType)

// Payloads de los eventos de Socket.io.
export const chatRoomPayload = z.strictObject({ planId: objectIdField })

export const chatSendPayload = z.strictObject({ planId: objectIdField, ...messageFields }).superRefine(checkContent).transform(withType)
