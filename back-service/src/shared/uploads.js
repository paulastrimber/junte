// Reglas de las subidas de imágenes a S3 (docs/arquitectura/09-seguridad.md#fotos-s3).
// Compartidas por `uploads` (presign) y `users` (vincular la foto): la lista blanca es una sola.

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
