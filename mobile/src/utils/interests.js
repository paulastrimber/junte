// Lista cerrada de intereses. Copia de back-service/src/shared/interests.js (el back es la fuente de verdad
// y rechaza cualquier valor que no esté en su lista). Falta cerrarla con el equipo y decidir si la app la
// pide a la API en lugar de duplicarla: docs/pendientes.md#lista-de-intereses.

export const INTERESTS = Object.freeze([
  { id: 'futbol', label: 'Fútbol' },
  { id: 'running', label: 'Running' },
  { id: 'estudio', label: 'Estudio' },
  { id: 'musica', label: 'Música' },
  { id: 'cine', label: 'Cine' },
  { id: 'juegos-de-mesa', label: 'Juegos de mesa' }
])

/** Máximo de intereses por usuario. */
export const MAX_INTERESTS = 5

/**
 * Agrega o quita un interés respetando el máximo.
 * @param {string[]} selected
 * @param {string} id
 * @returns {string[]}
 */
export function toggleInterest (selected, id) {
  if (selected.includes(id)) return selected.filter((item) => item !== id)
  return selected.length >= MAX_INTERESTS ? selected : [...selected, id]
}
