import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../shared/uploads.js'
import { z } from '../../shared/validation.js'

// `planId` (fotos de plan, creador) no está: se agrega con el módulo de planes (S3). Mientras tanto
// un `planId` en el body es 400 por .strict().
export const presignBody = z.strictObject({
  contentType: z.enum(Object.keys(ALLOWED_IMAGE_TYPES)),
  sizeBytes: z.int().min(1).max(MAX_IMAGE_BYTES)
})
