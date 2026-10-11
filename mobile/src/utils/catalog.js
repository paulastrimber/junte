// Helpers sobre los catálogos que devuelve GET /catalogs. La opción "Otra" no es parte del catálogo: es la key
// reservada `other` (igual que en el back, back-service/src/shared/catalog-keys.js), sin texto libre.

export const OTHER = 'other'
export const OTHER_LABEL = 'Otra'

/** Máximo de intereses por usuario (lo hace cumplir el back). */
export const MAX_INTERESTS = 10
/** Con pocos intereses el feed recomienda poco: se sugiere llegar a este número, sin obligar. */
export const RECOMMENDED_INTERESTS = 3

/** @param {object | null} catalog @returns {Array<{ key: string, label: string }>} */
export function universityOptions (catalog) {
  return (catalog?.universities ?? []).map(({ key, name, shortName }) => ({ key, label: `${name} (${shortName})` }))
}

/** Carreras de una universidad. Con universidad "Otra" o sin elegir no hay carreras para mostrar. */
export function careerOptions (catalog, universityKey) {
  const university = catalog?.universities.find((item) => item.key === universityKey)
  return (university?.careers ?? []).map(({ key, name, group }) => ({ key, label: name, group }))
}

export function cityOptions (catalog) {
  return (catalog?.cities ?? []).map(({ key, name }) => ({ key, label: name }))
}

/** Barrios de una ciudad. Con ciudad "Otra" o sin elegir no hay barrios. */
export function neighborhoodOptions (catalog, cityKey) {
  const city = catalog?.cities.find((item) => item.key === cityKey)
  return (city?.neighborhoods ?? []).map(({ key, name }) => ({ key, label: name }))
}

/** El texto de una key: el del catálogo, "Otra" para `other` y '' si no hay valor. */
export function labelFor (options, key) {
  if (!key) return ''
  if (key === OTHER) return OTHER_LABEL
  return options.find((option) => option.key === key)?.label ?? ''
}

/**
 * Categorías de intereses visibles para una edad. Las opciones con edad mínima (p. ej. 18) no se muestran a un menor,
 * ni mientras no se conozca la fecha de nacimiento. Las categorías que quedan vacías se omiten.
 * @param {object | null} catalog
 * @param {number | null} age
 */
export function visibleInterestCategories (catalog, age) {
  return (catalog?.interestCategories ?? [])
    .map((category) => ({
      ...category,
      interests: category.interests.filter((interest) => !interest.minAge || (age !== null && age >= interest.minAge))
    }))
    .filter((category) => category.interests.length > 0)
}

/** Agrega o quita un interés respetando el máximo. */
export function toggleInterest (selected, key) {
  if (selected.includes(key)) return selected.filter((item) => item !== key)
  return selected.length >= MAX_INTERESTS ? selected : [...selected, key]
}

/** Texto sin tildes ni mayúsculas, para buscar. */
export const normalizeText = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
