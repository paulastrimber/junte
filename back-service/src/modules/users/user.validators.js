// Esquemas Zod de /users/me. Estrictos: un campo desconocido (incluido `age`, que se deriva de
// birthDate) es 400, no se descarta en silencio.
import { USER_OBJECT_KEY } from './user.keys.js'
import { birthDateField, cityField, interestsField, nameField, neighborhoodField, universityField } from '../../shared/profile-fields.js'
import { z } from '../../shared/validation.js'

/**
 * @param {{ clock: import('../../adapters/clock.js').Clock }} deps  El reloj decide qué es "fecha futura" y la edad.
 */
export function createUserValidators ({ clock }) {
  const updateProfileBody = z.strictObject({
    name: nameField,
    birthDate: birthDateField(clock),
    university: universityField,
    neighborhood: neighborhoodField,
    city: cityField,
    interests: interestsField
  }).partial().refine((body) => Object.keys(body).length > 0, {
    error: 'Enviá al menos un campo para actualizar',
    // Si ya hay otros errores (campos desconocidos, valores inválidos) no se suma este.
    when: (payload) => payload.issues.length === 0
  })

  const setPhotoBody = z.strictObject({
    objectKey: z.string().max(200).regex(USER_OBJECT_KEY, { error: 'La clave del objeto no es válida' })
  })

  return { updateProfileBody, setPhotoBody }
}
