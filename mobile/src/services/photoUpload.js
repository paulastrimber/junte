// Foto de perfil (S2-MOB-05): presign → PUT directo a S3 → confirmar en el back.
// La app nunca recibe credenciales de AWS: sube con una URL firmada de pocos minutos.
import * as uploadsApi from './api/uploads.js'
import * as usersApi from './api/users.js'
import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'

// Mismos valores que back-service/src/shared/uploads.js. El back los vuelve a verificar con HeadObject.
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * @param {{ uri: string, mimeType?: string, fileSize?: number }} asset  Resultado de expo-image-picker.
 * @param {object} [deps]  Inyectables para tests.
 * @returns {Promise<object>} el perfil actualizado (con la photoUrl de lectura).
 * @throws {ApiError} IMAGE_NOT_SUPPORTED | IMAGE_TOO_LARGE | UPLOAD_FAILED | NETWORK_ERROR | errores del back
 */
export async function uploadProfilePhoto (asset, { uploads = uploadsApi, users = usersApi, fetchImpl = globalThis.fetch } = {}) {
  const blob = await readLocalFile(asset.uri, fetchImpl)
  const contentType = asset.mimeType ?? blob.type
  const sizeBytes = blob.size || asset.fileSize || 0

  if (!ALLOWED_TYPES.has(contentType) || sizeBytes < 1) {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.IMAGE_NOT_SUPPORTED })
  }
  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.IMAGE_TOO_LARGE })
  }

  const { url, objectKey } = await uploads.presign({ contentType, sizeBytes })
  await putToS3(url, blob, contentType, fetchImpl)
  return users.setPhoto({ objectKey })
}

async function readLocalFile (uri, fetchImpl) {
  try {
    return await (await fetchImpl(uri)).blob()
  } catch {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
  }
}

// Sin Authorization: la firma va en la URL y S3 rechaza una request con las dos formas de autenticación.
// El Content-Type tiene que ser el mismo que se pidió en el presign (va firmado).
async function putToS3 (url, blob, contentType, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
  } catch {
    throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  }
  if (!response.ok) throw new ApiError({ status: response.status, code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
}
