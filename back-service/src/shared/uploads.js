// Reglas de las subidas de imágenes a S3 (docs/arquitectura/09-seguridad.md#fotos-s3).
// Compartidas por `uploads` (presign), `users` y `plans` (vincular la foto): la lista blanca es una sola.
import { AppError, errors } from './errors.js'

/** Tipos permitidos y la extensión que lleva la clave del objeto. */
export const ALLOWED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
})

/** Máximo propuesto en 09-seguridad.md: 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** La app sube apenas recibe la URL: pocos minutos alcanzan. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60

/** URL de lectura de la foto de perfil. Cambia en cada respuesta (ver pendientes: caché de imágenes en la app). */
export const READ_URL_TTL_SECONDS = 10 * 60

/** Prefijo de las claves que le pertenecen a un usuario. */
export const userObjectPrefix = (userId) => `users/${userId}/`

/** Prefijo de las claves de las fotos de un plan (las sube su creador). */
export const planObjectPrefix = (planId) => `plans/${planId}/`

const EXTENSIONS = Object.values(ALLOWED_IMAGE_TYPES).join('|')

/** Parte de la clave después del prefijo del dueño: un nombre simple, sin barras ni `..`. */
export const OBJECT_NAME = new RegExp(`^[A-Za-z0-9-]{1,64}\\.(${EXTENSIONS})$`)

/**
 * Forma general de una clave bajo `<carpeta>/<ObjectId>/` (validación de forma de la request). El dueño lo decide el servicio.
 * @param {'users' | 'plans'} folder
 */
export const objectKeyPattern = (folder) => new RegExp(`^${folder}/[0-9a-f]{24}/[A-Za-z0-9-]{1,64}\\.(${EXTENSIONS})$`)

const invalidImage = (message) => new AppError('VALIDATION_ERROR', message)

/**
 * Verifica una imagen ya subida a S3 antes de vincularla: dueño (prefijo) → forma de la clave → existencia → tipo y
 * tamaño REALES. Si lo subido no cumple se borra el objeto (solo si cuelga del prefijo propio), para no dejar basura.
 * @param {object} params
 * @param {import('../adapters/storage/index.js').Storage} params.storage
 * @param {string} params.objectKey
 * @param {string} params.prefix  Prefijo que tiene que tener la clave (`users/<id>/`, `plans/<id>/`).
 * @throws {AppError} FORBIDDEN (otro dueño), VALIDATION_ERROR (clave, tipo o tamaño) o NOT_FOUND (no se subió).
 */
export async function verifyUploadedImage ({ storage, objectKey, prefix }) {
  if (!objectKey.startsWith(prefix)) throw errors.forbidden('Ese archivo no te pertenece')
  const name = objectKey.slice(prefix.length)
  if (!OBJECT_NAME.test(name)) throw invalidImage('La clave del archivo no es válida')

  const head = await storage.headObject(objectKey)
  if (!head) throw errors.notFound('No encontramos el archivo subido')

  const extension = name.slice(name.lastIndexOf('.') + 1)
  if (ALLOWED_IMAGE_TYPES[head.contentType] !== extension) {
    await storage.deleteObject(objectKey)
    throw invalidImage('El archivo no es una imagen JPEG, PNG o WebP')
  }
  if (head.sizeBytes < 1 || head.sizeBytes > MAX_IMAGE_BYTES) {
    await storage.deleteObject(objectKey)
    throw invalidImage(`La imagen debe pesar entre 1 byte y ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`)
  }
}
