// Fechas de calendario (sin hora) y edad. Funciones puras: el "hoy" llega siempre por parámetro
// (reloj inyectado), así el cálculo se testea sin depender de la fecha real.
//
// Una fecha de nacimiento es un día del calendario, no un instante. Se guarda como `Date` a
// medianoche UTC (así Mongo la devuelve igual en cualquier zona) y "hoy" se toma como el día del
// calendario en la zona horaria de la app, no en UTC: entre las 21:00 y las 24:00 de Montevideo ya es
// "mañana" en UTC, y la edad subiría un día antes de tiempo.

/** Zona en la que se interpreta "hoy". Uruguay no tiene horario de verano desde 2015. */
export const APP_TIME_ZONE = 'America/Montevideo'

export const MIN_AGE = 16
export const MAX_AGE = 100

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * @typedef {{ year: number, month: number, day: number }} CalendarDate  `month` 1–12.
 */

/**
 * Día del calendario de un instante en una zona horaria.
 * @param {Date} instant
 * @param {string} [timeZone]
 * @returns {CalendarDate}
 */
export function calendarDateIn (instant, timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant)
  const read = (type) => Number(parts.find((part) => part.type === type).value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

/**
 * Parsea `YYYY-MM-DD` estricto y comprueba que el día exista (no acepta 2026-02-30 ni 2026-2-3).
 * @param {unknown} text
 * @returns {CalendarDate | null}
 */
export function parseCalendarDate (text) {
  const match = typeof text === 'string' ? CALENDAR_DATE.exec(text) : null
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const roundTrip = new Date(Date.UTC(year, month - 1, day))
  const exists = roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day
  return exists && year >= 1 ? { year, month, day } : null
}

/**
 * @param {CalendarDate} date
 * @returns {Date} medianoche UTC de ese día.
 */
export function toUtcMidnight ({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * @param {Date} date  Fecha guardada a medianoche UTC.
 * @returns {CalendarDate}
 */
export function fromUtcMidnight (date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** @param {Date} date  Fecha guardada a medianoche UTC. @returns {string} `YYYY-MM-DD` */
export function formatCalendarDate (date) {
  return date.toISOString().slice(0, 10)
}

/** @param {CalendarDate} a @param {CalendarDate} b @returns {number} negativo, 0 o positivo */
export function compareCalendarDates (a, b) {
  return (a.year - b.year) || (a.month - b.month) || (a.day - b.day)
}

/**
 * Años cumplidos en `today`. El cumpleaños de quien nació un 29 de febrero se cumple el 1 de marzo
 * en los años no bisiestos (comparar mes y día como par lo da naturalmente).
 * @param {CalendarDate} birth
 * @param {CalendarDate} today
 * @returns {number}
 */
export function ageOn (birth, today) {
  const hadBirthday = (today.month - birth.month || today.day - birth.day) >= 0
  return today.year - birth.year - (hadBirthday ? 0 : 1)
}
