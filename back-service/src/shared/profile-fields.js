// Campos de perfil compartidos por el registro y por PUT /users/me: una sola definición de las
// reglas (largos, lista cerrada de intereses, fecha de nacimiento). Ver docs/pendientes.md#perfil.
import { MAX_AGE, MIN_AGE, ageOn, calendarDateIn, compareCalendarDates, parseCalendarDate, toUtcMidnight } from './age.js'
import { KEY_MAX_LENGTH, KEY_PATTERN, MAX_INTERESTS } from './catalog-keys.js'
import { z } from './validation.js'

export const NAME_MAX = 80

export const nameField = z.string().trim().min(1).max(NAME_MAX)

/**
 * Referencia a un catálogo (universidad, carrera, ciudad, barrio, interés): solo se valida la forma de la key;
 * que exista y esté disponible lo decide el servicio contra la base (catálogos editables por el admin).
 * La opción "Otra" es la key reservada `other`.
 */
export const catalogKeyField = z.string().regex(KEY_PATTERN, { error: 'La opción elegida no es válida' }).max(KEY_MAX_LENGTH)

export const interestsField = z.array(catalogKeyField).max(MAX_INTERESTS)
  .refine((items) => new Set(items).size === items.length, { error: 'No repitas intereses' })

/**
 * `YYYY-MM-DD` → Date a medianoche UTC. Válida, no futura y con edad entre 16 y 100 años.
 * El "hoy" sale del reloj inyectado y se interpreta en la zona horaria de la app (ver age.js).
 * @param {import('../adapters/clock.js').Clock} clock
 */
export function birthDateField (clock) {
  return z.string({ error: 'La fecha de nacimiento debe ser texto con formato AAAA-MM-DD' })
    .transform((text, ctx) => {
      const birth = parseCalendarDate(text)
      if (!birth) {
        ctx.addIssue({ code: 'custom', message: 'La fecha de nacimiento debe existir y tener el formato AAAA-MM-DD' })
        return z.NEVER
      }
      const today = calendarDateIn(clock.now())
      if (compareCalendarDates(birth, today) > 0) {
        ctx.addIssue({ code: 'custom', message: 'La fecha de nacimiento no puede ser futura' })
        return z.NEVER
      }
      const age = ageOn(birth, today)
      if (age < MIN_AGE || age > MAX_AGE) {
        ctx.addIssue({ code: 'custom', message: `La edad tiene que estar entre ${MIN_AGE} y ${MAX_AGE} años` })
        return z.NEVER
      }
      return toUtcMidnight(birth)
    })
}
