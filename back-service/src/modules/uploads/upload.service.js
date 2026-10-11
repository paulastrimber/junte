// POST /uploads/presign (S2-BE-09): la clave siempre cuelga del prefijo del dueño (users/<userId>/…),
// la genera el back (el cliente nunca elige el nombre) y la URL dura pocos minutos.
import { randomUUID } from 'node:crypto'
import { ALLOWED_IMAGE_TYPES, UPLOAD_URL_TTL_SECONDS, userObjectPrefix } from '../../shared/uploads.js'

/**
 * @param {object} deps
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {() => string} [deps.generateId]
 */
export function createUploadService ({ storage, generateId = randomUUID }) {
  return {
    /**
     * @param {{ userId: string, contentType: string, sizeBytes: number }} params  Ya validado (lista blanca y tope).
     * @returns {Promise<{ url: string, objectKey: string, expiresAt: Date }>}
     */
    async presign ({ userId, contentType, sizeBytes }) {
      const objectKey = `${userObjectPrefix(userId)}${generateId()}.${ALLOWED_IMAGE_TYPES[contentType]}`
      const { url, expiresAt } = await storage.presignUpload({
        key: objectKey, contentType, sizeBytes, expiresInSeconds: UPLOAD_URL_TTL_SECONDS
      })
      return { url, objectKey, expiresAt }
    }
  }
}
