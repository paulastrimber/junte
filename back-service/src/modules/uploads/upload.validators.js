import { ALLOWED_AUDIO_TYPES, ALLOWED_IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '../../shared/uploads.js'
import { objectIdField, z } from '../../shared/validation.js'

const isAudio = (contentType) => Object.hasOwn(ALLOWED_AUDIO_TYPES, contentType)

export const presignBody = z.strictObject({
  contentType: z.enum([...Object.keys(ALLOWED_IMAGE_TYPES), ...Object.keys(ALLOWED_AUDIO_TYPES)]),
  sizeBytes: z.int().min(1),
  // Imagen: con `planId` es la foto de ese plan (solo su creador); sin él, la foto de perfil del usuario.
  // Audio (nota de voz, S5-BE-09): `planId` obligatorio, el chat en el que se va a mandar.
  planId: objectIdField.optional()
}).superRefine(({ contentType, sizeBytes, planId }, ctx) => {
  const audio = isAudio(contentType)
  const max = audio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
  if (Number.isInteger(sizeBytes) && sizeBytes > max) {
    ctx.addIssue({ code: 'too_big', maximum: max, origin: 'number', inclusive: true, path: ['sizeBytes'], input: sizeBytes })
  }
  if (audio && planId === undefined) {
    ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Una nota de voz necesita el plan del chat' })
  }
})
