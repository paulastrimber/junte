// Esquemas Zod del chat. Los usan REST y Socket.io (mismas reglas por los dos caminos). La identidad sale del token:
// `senderId` en un body es 400 (strict).
import { cursorField, limitField } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'
import { CLIENT_ID_MAX_LENGTH, MESSAGE_TEXT_MAX_LENGTH } from './message.model.js'

// Se recorta antes de medir: un texto de solo espacios es vacío.
const textField = z.string().trim().min(1).max(MESSAGE_TEXT_MAX_LENGTH)

// Clave de idempotencia que genera el teléfono (no es un secreto). Solo caracteres seguros para logs y URLs.
const clientIdField = z.string().min(1).max(CLIENT_ID_MAX_LENGTH).regex(/^[A-Za-z0-9_-]+$/, { error: 'El identificador del mensaje no es válido' })

export const listMessagesQuery = z.strictObject({
  limit: limitField,
  cursor: cursorField.optional()
})

export const sendMessageBody = z.strictObject({
  text: textField,
  clientId: clientIdField.optional()
})

// Payloads de los eventos de Socket.io.
export const chatRoomPayload = z.strictObject({ planId: objectIdField })

export const chatSendPayload = z.strictObject({
  planId: objectIdField,
  text: textField,
  clientId: clientIdField.optional()
})
