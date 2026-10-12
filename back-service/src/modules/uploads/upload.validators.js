import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../shared/uploads.js'
import { objectIdField, z } from '../../shared/validation.js'

export const presignBody = z.strictObject({
  contentType: z.enum(Object.keys(ALLOWED_IMAGE_TYPES)),
  sizeBytes: z.int().min(1).max(MAX_IMAGE_BYTES),
  // Con `planId` la foto es de ese plan (solo su creador); sin él, es la foto de perfil del usuario.
  planId: objectIdField.optional()
})
