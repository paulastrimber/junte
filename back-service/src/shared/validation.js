// Zod con los mensajes por defecto en español (los `details` de VALIDATION_ERROR se muestran en la app).
// Todos los validators importan `z` desde acá para que la configuración se aplique siempre.
import { z } from 'zod'

z.config(z.locales.es())

export { z }

/** ObjectId de MongoDB como string (24 hex en minúsculas): params de ruta y referencias en un body. */
export const objectIdField = z.string().regex(/^[0-9a-f]{24}$/, { error: 'El identificador no es válido' })

/** Instante ISO 8601 CON zona horaria (`2026-10-25T18:00:00-03:00` o `…Z`) → Date. Sin zona es 400. */
export const instantField = z.iso.datetime({ offset: true, error: 'Debe ser una fecha y hora ISO 8601 con zona horaria' })
  .transform((text) => new Date(text))

/**
 * Para los `refine` que comparan dos fechas de un objeto: Zod los corre aunque un campo haya fallado (y entonces no
 * llega como Date). Si alguna no es una fecha válida devuelve true: ese campo ya informó su propio error.
 * @param {unknown} later
 * @param {unknown} earlier
 */
export function isAfterOrUnknown (later, earlier) {
  if (!(later instanceof Date) || !(earlier instanceof Date)) return true
  return later.getTime() > earlier.getTime()
}
