// Convenciones de los catálogos (intereses, universidades, carreras, ciudades, barrios):
// el usuario guarda la `key` (inmutable, kebab-case); el nombre que se muestra lo edita el admin.

/** Opción reservada "Otra": válida en universidad, carrera, ciudad y barrio, sin texto libre. No es una fila del catálogo. */
export const OTHER = 'other'

/** Forma de una key: minúsculas, números y guiones (`tocar-la-guitarra`). */
export const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const KEY_MAX_LENGTH = 80

/** Máximo de intereses por usuario (y por plan, cuando exista el pendiente de S3). */
export const MAX_INTERESTS = 10
