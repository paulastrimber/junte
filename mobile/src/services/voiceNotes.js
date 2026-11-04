// Notas de voz del chat (S5-MOB-05): presign → PUT directo a S3 → el mensaje lleva la `audioKey`.
// Mismo flujo que la foto de perfil (services/photoUpload.js); el back vuelve a verificar dueño, tipo y tamaño.
import * as uploadsApi from './api/uploads.js'
import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'

// Mismos valores que back-service/src/shared/uploads.js.
export const VOICE_CONTENT_TYPE = 'audio/mp4'
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024
export const VOICE_MAX_DURATION_MS = 60 * 1000

/**
 * Sube una nota de voz grabada (archivo .m4a local).
 * @param {{ planId: string, uri: string, durationMs: number }} note
 * @param {object} [deps]  Inyectables para tests.
 * @returns {Promise<{ audioKey: string, durationMs: number }>} lo que va en el mensaje.
 * @throws {ApiError} AUDIO_TOO_LARGE | UPLOAD_FAILED | NETWORK_ERROR | errores del back (p. ej. FORBIDDEN)
 */
export async function uploadVoiceNote ({ planId, uri, durationMs }, { uploads = uploadsApi, fetchImpl = globalThis.fetch } = {}) {
  const blob = await readLocalFile(uri, fetchImpl)
  const sizeBytes = blob.size || 0
  const duration = Math.max(1, Math.round(durationMs))
  if (sizeBytes < 1) throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
  if (sizeBytes > MAX_AUDIO_BYTES || duration > VOICE_MAX_DURATION_MS) {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.AUDIO_TOO_LARGE })
  }
  const { url, objectKey } = await uploads.presign({ contentType: VOICE_CONTENT_TYPE, sizeBytes, planId })
  let response
  try {
    // Sin Authorization: la firma va en la URL. El Content-Type es el mismo que se firmó.
    response = await fetchImpl(url, { method: 'PUT', headers: { 'Content-Type': VOICE_CONTENT_TYPE }, body: blob })
  } catch {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  }
  if (!response.ok) throw new ApiError({ status: response.status, code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
  return { audioKey: objectKey, durationMs: duration }
}

async function readLocalFile (uri, fetchImpl) {
  try {
    return await (await fetchImpl(uri)).blob()
  } catch {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
  }
}
