// Lista cerrada de intereses, compartida por perfil de usuario y (en S3) planes.
// Valores iniciales: los de los seeds. Falta cerrarla con el equipo (docs/pendientes.md#lista-de-intereses).
// Agregar o quitar un valor acá cambia el contrato de la API: actualizar 06-api.md y la app en el mismo PR.

export const INTERESTS = Object.freeze(['futbol', 'running', 'estudio', 'musica', 'cine', 'juegos-de-mesa'])

/** Máximo de intereses por usuario (y por plan, cuando exista el pendiente de S3). */
export const MAX_INTERESTS = 5

/** @param {unknown} value */
export function isKnownInterest (value) {
  return typeof value === 'string' && INTERESTS.includes(value)
}
