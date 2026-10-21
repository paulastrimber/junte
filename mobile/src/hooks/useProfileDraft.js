import { useMemo, useState } from 'react'

import { ageOn, parseCalendarDate, today } from '../utils/dates.js'
import {
  careerOptions, cityOptions, dependentFieldState, neighborhoodOptions, toggleInterest as toggleInterestIn, universityOptions, visibleInterestCategories
} from '../utils/catalog.js'

const fromUser = (user) => ({
  name: user?.name ?? '',
  birthDate: user?.birthDate ?? '',
  university: user?.university ?? '',
  career: user?.career ?? '',
  city: user?.city ?? '',
  neighborhood: user?.neighborhood ?? '',
  interests: user?.interests ?? []
})

const sameItems = (a, b) => a.length === b.length && a.every((item) => b.includes(item))

/**
 * Borrador del perfil que comparten el onboarding y la pantalla de perfil: valores en edición, opciones de los selectores
 * según el catálogo y los cambios respecto de lo guardado. La carrera depende de la universidad y el barrio de la ciudad:
 * al cambiar la de arriba se vacía la de abajo (el back hace lo mismo).
 * @param {object} user  Perfil guardado.
 * @param {object | null} catalog  GET /catalogs (null mientras carga).
 */
export function useProfileDraft (user, catalog) {
  const initial = useMemo(() => fromUser(user), [user])
  const [values, setValues] = useState(initial)

  function setField (field, value) {
    setValues((current) => {
      const next = { ...current, [field]: value }
      if (field === 'university' && value !== current.university) next.career = ''
      if (field === 'city' && value !== current.city) next.neighborhood = ''
      return next
    })
  }

  function toggleInterest (key) {
    setValues((current) => ({ ...current, interests: toggleInterestIn(current.interests, key) }))
  }

  const birth = parseCalendarDate(values.birthDate)
  const age = birth ? ageOn(birth, today()) : null

  const options = useMemo(() => ({
    universities: universityOptions(catalog),
    careers: careerOptions(catalog, values.university),
    cities: cityOptions(catalog),
    neighborhoods: neighborhoodOptions(catalog, values.city),
    interestCategories: visibleInterestCategories(catalog, age)
  }), [catalog, values.university, values.city, age])

  // Carrera y barrio dependen de otro selector: si están deshabilitados y por qué (lo mismo en onboarding y perfil).
  const dependents = useMemo(() => ({
    career: dependentFieldState(values.university, options.careers),
    neighborhood: dependentFieldState(values.city, options.neighborhoods)
  }), [values.university, values.city, options.careers, options.neighborhoods])

  /**
   * Lo que cambió, solo de los campos pedidos. Los selectores vacíos no se mandan (no hay forma de "borrar" una opción;
   * lo que depende de otra lo quita el back). Los intereses sí se mandan aunque queden vacíos.
   * @param {string[]} fields
   */
  function changesFor (fields) {
    const changes = {}
    for (const field of fields) {
      if (field === 'interests') {
        if (!sameItems(values.interests, initial.interests)) changes.interests = values.interests
      } else if (field === 'name') {
        // Un nombre vacío también cuenta como cambio: el formulario lo valida antes de mandarlo.
        const name = values.name.trim()
        if (name !== initial.name) changes.name = name
      } else if (values[field] !== '' && values[field] !== initial[field]) {
        changes[field] = values[field]
      }
    }
    return changes
  }

  return { values, setField, toggleInterest, age, options, dependents, changesFor }
}
