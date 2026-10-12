// POST /uploads/presign (S2-BE-09, S3-BE-08): la clave siempre cuelga del prefijo del dueño (users/<userId>/… o,
// para la foto de un plan, plans/<planId>/… y solo para su creador), la genera el back (el cliente nunca elige el
// nombre) y la URL dura pocos minutos.
import { randomUUID } from 'node:crypto'
import { ALLOWED_IMAGE_TYPES, UPLOAD_URL_TTL_SECONDS, planObjectPrefix, userObjectPrefix } from '../../shared/uploads.js'

/**
 * @param {object} deps
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {{ assertCreator: (params: { planId: string, userId: string }) => Promise<unknown> }} deps.plans
 *   Servicio de planes: lanza NOT_FOUND / FORBIDDEN si el usuario no puede subir la foto de ese plan.
 * @param {() => string} [deps.generateId]
 */
export function createUploadService ({ storage, plans, generateId = randomUUID }) {
  return {
    /**
     * @param {{ userId: string, contentType: string, sizeBytes: number, planId?: string }} params  Ya validado (lista blanca y tope).
     * @returns {Promise<{ url: string, objectKey: string, expiresAt: Date }>}
     * @throws {import('../../shared/errors.js').AppError} NOT_FOUND | FORBIDDEN si `planId` no es un plan del usuario.
     */
    async presign ({ userId, contentType, sizeBytes, planId }) {
      if (planId) await plans.assertCreator({ planId, userId })
      const prefix = planId ? planObjectPrefix(planId) : userObjectPrefix(userId)
      const objectKey = `${prefix}${generateId()}.${ALLOWED_IMAGE_TYPES[contentType]}`
      const { url, expiresAt } = await storage.presignUpload({
        key: objectKey, contentType, sizeBytes, expiresInSeconds: UPLOAD_URL_TTL_SECONDS
      })
      return { url, objectKey, expiresAt }
    }
  }
}
