// Esquemas Zod de las inscripciones. La identidad sale del token: ningún body acepta `userId`.
import { cursorField, limitField } from '../../shared/pagination.js'
import { z } from '../../shared/validation.js'

// POST y DELETE /plans/:id/join no llevan cuerpo: cualquier campo (p. ej. `userId`) es 400.
export const emptyBody = z.strictObject({})

export const listParticipantsQuery = z.strictObject({
  limit: limitField,
  cursor: cursorField.optional()
})
