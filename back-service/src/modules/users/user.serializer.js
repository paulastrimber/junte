// La "vista" del usuario: el único lugar que decide qué sale en el JSON. Lista blanca explícita
// (nunca `...user`): passwordHash y todo lo de sesiones quedan afuera aunque el modelo cambie.
import { calendarDateIn, ageOn, formatCalendarDate, fromUtcMidnight } from '../../shared/age.js'
import { READ_URL_TTL_SECONDS } from '../../shared/uploads.js'
import { isProfileComplete } from './user.profile.js'

/**
 * @param {object} deps
 * @param {import('../../adapters/storage/index.js').Storage} deps.storage
 * @param {import('../../adapters/clock.js').Clock} deps.clock  Para calcular la edad.
 */
export function createUserSerializer ({ storage, clock }) {
  const photoUrlOf = (user) => (user.photoKey
    ? storage.presignDownload({ key: user.photoKey, expiresInSeconds: READ_URL_TTL_SECONDS })
    : null)

  return {
    /**
     * Vista del dueño (GET/PUT /users/me, registro y login). Es la única que lleva birthDate, age,
     * barrio y localidad: no se exponen a otros usuarios. `age` se calcula acá, nunca se guarda.
     * @param {import('./user.repository.js').UserEntity} user
     */
    async serializeOwner (user) {
      const birth = user.birthDate ? fromUtcMidnight(user.birthDate) : null
      return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        birthDate: user.birthDate ? formatCalendarDate(user.birthDate) : null,
        age: birth ? ageOn(birth, calendarDateIn(clock.now())) : null,
        university: user.university ?? null,
        neighborhood: user.neighborhood ?? null,
        city: user.city ?? null,
        interests: user.interests,
        reputation: user.reputation,
        photoUrl: await photoUrlOf(user),
        profileComplete: isProfileComplete(user),
        createdAt: user.createdAt.toISOString()
      }
    },

    /**
     * Vista mínima para otros usuarios (creador de un plan, inscriptos, chat). Qué más se muestra
     * (edad, barrio, universidad) queda pendiente: docs/pendientes.md#visibilidad-del-perfil-público.
     * @param {import('./user.repository.js').UserEntity} user
     */
    async serializePublic (user) {
      return { id: user.id, name: user.name ?? null, photoUrl: await photoUrlOf(user) }
    }
  }
}
