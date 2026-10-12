// Esquema Zod de POST /feed. Va por body (no por query) para que las franjas del calendario no queden en los logs
// de acceso de Nginx ni del ALB. Estricto: un campo desconocido es 400.
import { lngLatField, radiusKmField } from '../../shared/geo.js'
import { cursorField, limitField } from '../../shared/pagination.js'
import { instantField, isAfterOrUnknown, z } from '../../shared/validation.js'
import { coherentFilterDates, planFilterBodyFields } from '../plans/index.js'

/** Máximo de franjas ocupadas por consulta y período máximo de calendario que se acepta. */
export const CALENDAR_LIMITS = Object.freeze({ MAX_BUSY_SLOTS: 200, MAX_WINDOW_MS: 31 * 24 * 60 * 60 * 1000 })

// Solo inicio y fin: la app nunca manda título, lugar ni invitados de un evento.
const busySlot = z.strictObject({ start: instantField, end: instantField })
  .refine(({ start, end }) => isAfterOrUnknown(end, start), { error: 'La franja tiene que terminar después de empezar', path: ['end'] })

const calendarField = z.strictObject({
  // Período que la app leyó del calendario: fuera de él no se sabe si la persona está libre.
  from: instantField,
  to: instantField,
  busy: z.array(busySlot).max(CALENDAR_LIMITS.MAX_BUSY_SLOTS)
})
  .refine(({ from, to }) => isAfterOrUnknown(to, from), { error: '"to" tiene que ser posterior a "from"', path: ['to'] })
  .refine(({ from, to }) => !(from instanceof Date) || !(to instanceof Date) || to.getTime() - from.getTime() <= CALENDAR_LIMITS.MAX_WINDOW_MS, {
    error: 'El período del calendario puede ser de 31 días como máximo', path: ['to']
  })

export const feedBody = z.strictObject({
  ...planFilterBodyFields,
  near: lngLatField,
  radiusKm: radiusKmField.optional(),
  // Sin permiso de calendario la app no manda `calendar` (la compatibilidad horaria queda neutral).
  calendar: calendarField.optional(),
  limit: limitField,
  cursor: cursorField.optional()
}).refine(...coherentFilterDates)
