// Fecha de nacimiento como día del calendario (`YYYY-MM-DD`), sin hora ni zona: es lo que manda y
// devuelve la API. El selector de fecha trabaja con `Date` locales; acá se convierte siempre con las
// partes LOCALES (año/mes/día), nunca con toISOString (que pasa por UTC y puede correr un día).

export const MIN_AGE = 16
export const MAX_AGE = 100

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const pad = (value) => String(value).padStart(2, '0')

/** @param {Date} date @returns {string} `YYYY-MM-DD` con el día local de `date`. */
export function toCalendarDate (date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * @param {string} text `YYYY-MM-DD`
 * @returns {{ year: number, month: number, day: number } | null} null si no es una fecha que exista.
 */
export function parseCalendarDate (text) {
  const match = typeof text === 'string' ? CALENDAR_DATE.exec(text) : null
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const probe = new Date(year, month - 1, day)
  const exists = probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day
  return exists ? { year, month, day } : null
}

/** @param {string} text `YYYY-MM-DD` @returns {Date | null} mediodía local de ese día (a salvo de cambios de hora). */
export function toLocalDate (text) {
  const parsed = parseCalendarDate(text)
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 12) : null
}

/** @param {string} text `YYYY-MM-DD` @returns {string} `DD/MM/AAAA` para mostrar. */
export function formatForDisplay (text) {
  const parsed = parseCalendarDate(text)
  return parsed ? `${pad(parsed.day)}/${pad(parsed.month)}/${parsed.year}` : ''
}

/**
 * Años cumplidos. Quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos.
 * @param {{ year: number, month: number, day: number }} birth
 * @param {{ year: number, month: number, day: number }} today
 */
export function ageOn (birth, today) {
  const hadBirthday = (today.month - birth.month || today.day - birth.day) >= 0
  return today.year - birth.year - (hadBirthday ? 0 : 1)
}

/** @param {Date} [now] @returns {{ year: number, month: number, day: number }} el día local de `now`. */
export function today (now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}
