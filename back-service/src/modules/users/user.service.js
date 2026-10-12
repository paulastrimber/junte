// Reglas de negocio del perfil (S2-BE-08, S2-BE-09). No importa Express ni Mongoose: recibe el
// repositorio y el storage por parámetro (DI).
import { ageOn, calendarDateIn, fromUtcMidnight } from '../../shared/age.js'
import { errors } from '../../shared/errors.js'
import { userObjectPrefix, verifyUploadedImage } from '../../shared/uploads.js'
import { isProfileComplete } from './user.profile.js'

export { isProfileComplete }

/**
 * @param {object} deps
 * @param {ReturnType<import('./user.repository.js').createUserRepository>} deps.userRepo
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {{ checkProfileReferences: (params: object) => Promise<Array<{ path: string, message: string }>> }} deps.catalogs
 *   Valida universidad, carrera, ciudad, barrio e intereses contra los catálogos (módulo `catalogs`).
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ warn: (obj: object, msg: string) => void }} deps.logger
 */
export function createUserService ({ userRepo, storage, catalogs, clock, logger }) {
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
     * Actualiza el perfil (cambio parcial). Valida el perfil RESULTANTE contra los catálogos (que la opción exista, esté
     * disponible, la carrera sea de la universidad, el barrio de la ciudad y los intereses respeten su edad mínima).
     * Si cambia la universidad se quita la carrera, y si cambia la ciudad se quita el barrio (salvo que lleguen
     * nuevos en el mismo pedido): ya no corresponden.
     * @param {{ userId: string, changes: object }} params  `changes` ya validado en su forma (Zod strict).
     * @throws {AppError} VALIDATION_ERROR con `details` por campo.
     */
    async updateProfile ({ userId, changes: { onboardingCompleted, ...changes } }) {
      const current = await requireUser(() => userRepo.findById(userId))
      const next = { ...current, ...changes }
      const unset = []
      if (changes.university !== undefined && changes.university !== current.university && changes.career === undefined && current.career !== undefined) {
        unset.push('career')
        next.career = undefined
      }
      if (changes.city !== undefined && changes.city !== current.city && changes.neighborhood === undefined && current.neighborhood !== undefined) {
        unset.push('neighborhood')
        next.neighborhood = undefined
      }

      const age = next.birthDate ? ageOn(fromUtcMidnight(next.birthDate), calendarDateIn(clock.now())) : null
      const details = await catalogs.checkProfileReferences({ current, next, age })
      if (details.length > 0) throw errors.validation(details)

      const set = { ...changes }
      if (onboardingCompleted && !current.onboardingCompletedAt) set.onboardingCompletedAt = clock.now()
      return requireUser(() => userRepo.updateProfile(userId, set, { unset }))
    },

    /**
     * Vincula la foto subida a S3: dueño → existencia → tipo y tamaño reales. Si lo subido no
     * cumple, se borra el objeto (solo si es del propio usuario) para no dejar basura en el bucket.
     * @param {{ userId: string, objectKey: string }} params
     */
    async setPhoto ({ userId, objectKey }) {
      await verifyUploadedImage({ storage, objectKey, prefix: userObjectPrefix(userId) })

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
