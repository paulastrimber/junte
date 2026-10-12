// Reglas puras sobre los catálogos (sin acceso a la base): validación de las referencias de un perfil y la vista
// pública que consume la app. Reciben el "snapshot" completo (activo o no): lo desactivado no se puede elegir de nuevo,
// pero quien ya lo tenía lo conserva.
import { createHash } from 'node:crypto'
import { OTHER } from '../../shared/catalog-keys.js'

const byKey = (items, key) => items.find((item) => item.key === key)
const problem = (path, message) => ({ path, message })

/**
 * Valida el perfil RESULTANTE (lo que quedaría guardado) contra los catálogos.
 * @param {object} snapshot  Todo el contenido de los catálogos.
 * @param {{ current: object, next: object, age: number | null }} params
 *   `current`: lo que el usuario tiene guardado (una opción desactivada que ya tenía sigue valiendo).
 *   `next`: el perfil resultante. `age`: años cumplidos según el `birthDate` resultante, o null si no hay.
 * @returns {Array<{ path: string, message: string }>} problemas (vacío si todo es válido).
 */
export function checkProfileReferences (snapshot, { current, next, age }) {
  const details = []
  const kept = (field, value) => current?.[field] === value

  if (next.university !== undefined && next.university !== OTHER) {
    const university = byKey(snapshot.universities, next.university)
    if (!university) details.push(problem('university', 'La universidad elegida no existe'))
    else if (!university.active && !kept('university', next.university)) details.push(problem('university', 'La universidad elegida ya no está disponible'))
  }

  if (next.career !== undefined) {
    if (next.university === undefined) {
      details.push(problem('career', 'Elegí primero una universidad'))
    } else if (next.university === OTHER) {
      details.push(problem('career', 'Con otra universidad no se elige carrera'))
    } else if (next.career !== OTHER) {
      const career = snapshot.careers.find((item) => item.universityKey === next.university && item.key === next.career)
      if (!career) details.push(problem('career', 'La carrera elegida no existe en esa universidad'))
      else if (!career.active && !kept('career', next.career)) details.push(problem('career', 'La carrera elegida ya no está disponible'))
    }
  }

  if (next.city !== undefined && next.city !== OTHER) {
    const city = byKey(snapshot.cities, next.city)
    if (!city) details.push(problem('city', 'La ciudad elegida no existe'))
    else if (!city.active && !kept('city', next.city)) details.push(problem('city', 'La ciudad elegida ya no está disponible'))
  }

  if (next.neighborhood !== undefined) {
    if (next.city === undefined || next.city === OTHER) {
      details.push(problem('neighborhood', 'Elegí primero una ciudad con barrios'))
    } else if (next.neighborhood !== OTHER) {
      const neighborhood = snapshot.neighborhoods.find((item) => item.cityKey === next.city && item.key === next.neighborhood)
      if (!neighborhood) details.push(problem('neighborhood', 'El barrio elegido no existe en esa ciudad'))
      else if (!neighborhood.active && !kept('neighborhood', next.neighborhood)) details.push(problem('neighborhood', 'El barrio elegido ya no está disponible'))
    }
  }

  details.push(...checkInterestReferences(snapshot, { keys: next.interests ?? [], kept: current?.interests ?? [], age }))

  return details
}

/**
 * Valida una lista de intereses (de un perfil o de un plan) contra el catálogo: que existan, que estén disponibles
 * (salvo los que ya se tenían) y que la edad alcance para los que tienen edad mínima.
 * @param {object} snapshot
 * @param {{ keys: string[], kept?: string[], age: number | null }} params
 *   `kept`: intereses que ya estaban guardados (uno desactivado se conserva). `age`: años cumplidos, o null si no se sabe.
 * @returns {Array<{ path: 'interests', message: string }>}
 */
export function checkInterestReferences (snapshot, { keys, kept = [], age }) {
  const details = []
  for (const key of keys) {
    const interest = byKey(snapshot.interests, key)
    const category = interest && byKey(snapshot.interestCategories, interest.categoryKey)
    if (!interest || !category) {
      details.push(problem('interests', `El interés "${key}" no existe`))
      continue
    }
    if ((!interest.active || !category.active) && !kept.includes(key)) {
      details.push(problem('interests', `El interés "${interest.name}" ya no está disponible`))
    }
    if (interest.minAge && (age === null || age < interest.minAge)) {
      details.push(problem('interests', `"${interest.name}" requiere tener ${interest.minAge} años o más${age === null ? ' (cargá tu fecha de nacimiento primero)' : ''}`))
    }
  }
  return details
}

const ACTIVE = (item) => item.active

/**
 * Vista que consume la app: solo lo activo, anidado (categoría → intereses, universidad → carreras, ciudad → barrios)
 * y sin campos internos. `version` cambia cuando cambia el contenido (sirve de clave de caché en la app).
 * @param {object} snapshot
 */
export function buildPublicCatalog (snapshot) {
  const interestCategories = snapshot.interestCategories.filter(ACTIVE).map((category) => ({
    key: category.key,
    name: category.name,
    interests: snapshot.interests
      .filter((interest) => interest.categoryKey === category.key && interest.active)
      .map(({ key, name, minAge }) => ({ key, name, ...(minAge ? { minAge } : {}) }))
  }))

  const universities = snapshot.universities.filter(ACTIVE).map((university) => ({
    key: university.key,
    name: university.name,
    shortName: university.shortName,
    careers: snapshot.careers
      .filter((career) => career.universityKey === university.key && career.active)
      .map(({ key, name, group }) => ({ key, name, ...(group ? { group } : {}) }))
  }))

  const cities = snapshot.cities.filter(ACTIVE).map((city) => ({
    key: city.key,
    name: city.name,
    neighborhoods: snapshot.neighborhoods
      .filter((neighborhood) => neighborhood.cityKey === city.key && neighborhood.active)
      .map(({ key, name }) => ({ key, name }))
  }))

  const content = { interestCategories, universities, cities }
  const version = createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 12)
  return { version, ...content }
}
