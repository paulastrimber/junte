// Reglas de negocio del perfil (S2-BE-08, S2-BE-09). No importa Express ni Mongoose: recibe el
// repositorio y el storage por parámetro (DI).
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, userObjectPrefix } from '../../shared/uploads.js'
import { AppError, errors } from '../../shared/errors.js'
import { OBJECT_NAME } from './user.keys.js'
import { isProfileComplete } from './user.profile.js'

export { isProfileComplete }

const invalidPhoto = (message) => new AppError('VALIDATION_ERROR', message)

/**
 * @param {object} deps
 * @param {ReturnType<import('./user.repository.js').createUserRepository>} deps.userRepo
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {{ warn: (obj: object, msg: string) => void }} deps.logger
 */
export function createUserService ({ userRepo, storage, logger }) {
  async function requireUser (load) {
    // authenticate ya comprobó que existe; si desapareció en el medio no es un 404 del recurso:
    // la sesión ya no corresponde a un usuario.
    const user = await load()
    if (!user) throw errors.unauthenticated()
    return user
  }

  return {
    isProfileComplete,

    getProfile: (userId) => requireUser(() => userRepo.findById(userId)),

    /**
     * @param {{ userId: string, changes: object }} params  `changes` ya validado (Zod strict).
     */
    updateProfile: ({ userId, changes }) => requireUser(() => userRepo.updateProfile(userId, changes)),

    /**
     * Vincula la foto subida a S3: dueño → existencia → tipo y tamaño reales. Si lo subido no
     * cumple, se borra el objeto (solo si es del propio usuario) para no dejar basura en el bucket.
     * @param {{ userId: string, objectKey: string }} params
     */
    async setPhoto ({ userId, objectKey }) {
      const prefix = userObjectPrefix(userId)
      if (!objectKey.startsWith(prefix)) throw errors.forbidden('Ese archivo no te pertenece')
      const name = objectKey.slice(prefix.length)
      if (!OBJECT_NAME.test(name)) throw invalidPhoto('La clave del archivo no es válida')

      const head = await storage.headObject(objectKey)
      if (!head) throw errors.notFound('No encontramos el archivo subido')

      const extension = name.slice(name.lastIndexOf('.') + 1)
      if (ALLOWED_IMAGE_TYPES[head.contentType] !== extension) {
        await storage.deleteObject(objectKey)
        throw invalidPhoto('El archivo no es una imagen JPEG, PNG o WebP')
      }
      if (head.sizeBytes < 1 || head.sizeBytes > MAX_IMAGE_BYTES) {
        await storage.deleteObject(objectKey)
        throw invalidPhoto(`La imagen debe pesar entre 1 byte y ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`)
      }

      const current = await requireUser(() => userRepo.findById(userId))
      const updated = await requireUser(() => userRepo.setPhotoKey(userId, objectKey))

      // Después de guardar: la foto anterior ya no la referencia nadie. Si falla, queda huérfana (se loguea).
      if (current.photoKey && current.photoKey !== objectKey) {
        await storage.deleteObject(current.photoKey).catch((err) => {
          logger.warn({ err, userId }, 'could not delete previous profile photo')
        })
      }
      return updated
    }
  }
}
