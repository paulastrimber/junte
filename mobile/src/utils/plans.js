// Funciones puras sobre planes: textos para mostrar, opciones de los filtros y validación local del formulario.
// El back valida todo otra vez (Zod): esto solo ahorra un viaje al servidor y da el error junto al campo.

import { spacing } from '../theme/tokens.js'

/** Mismos límites que el back (back-service/src/modules/plans/plan.rules.js). */
export const PLAN_LIMITS = Object.freeze({
  TITLE_MIN: 3,
  TITLE_MAX: 100,
  DESCRIPTION_MAX: 2000,
  LABEL_MAX: 120,
  CAPACITY_MAX: 500,
  PRICE_MAX: 100_000,
  MAX_DURATION_DAYS: 7
})

/** Radios que ofrece el selector del feed (km). El back acepta cualquier valor entre su mínimo y su máximo. */
export const RADIUS_OPTIONS_KM = Object.freeze([0.5, 1, 2, 5, 10, 25, 50])
export const DEFAULT_RADIUS_KM = 10

export const AVAILABILITY = Object.freeze({ AVAILABLE: 'available', FULL: 'full' })

export const DATE_PRESETS = Object.freeze([
  { key: 'any', label: 'Cualquier fecha' },
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Próximos 7 días' },
  { key: 'month', label: 'Próximos 30 días' }
])

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const pad = (value) => String(value).padStart(2, '0')
const thousands = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/**
 * Rango de fechas (`to`) de un filtro predefinido. Sin `from`: el back ya muestra solo planes que no empezaron.
 * @param {string} preset  Key de DATE_PRESETS.
 * @param {Date} [now]
 * @returns {{ to?: string }}
 */
export function dateRangeFor (preset, now = new Date()) {
  if (preset === 'today') {
    return { to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString() }
  }
  if (preset === 'week') return { to: new Date(now.getTime() + 7 * DAY_MS).toISOString() }
  if (preset === 'month') return { to: new Date(now.getTime() + 30 * DAY_MS).toISOString() }
  return {}
}

/** @param {number} price Pesos uruguayos, entero. @returns {string} "Gratis" o "$ 1.500". */
export function formatPrice (price) {
  return price > 0 ? `$ ${thousands(price)}` : 'Gratis'
}

/**
 * Texto de un rango de precio de GET /plans/filters (los límites los define el back).
 * @param {{ min: number, max: number | null }} range
 */
export function priceRangeLabel ({ min, max }) {
  if (max === 0) return 'Gratis'
  if (max === null) return `Más de $ ${thousands(min - 1)}`
  return `$ ${thousands(min)} a $ ${thousands(max)}`
}

/** @param {number} km @returns {string} "500 m" o "10 km". */
export function radiusLabel (km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`
}

/** @param {number} meters @returns {string} "a 350 m" o "a 2,4 km". */
export function formatDistance (meters) {
  if (meters < 1000) return `a ${Math.max(10, Math.round(meters / 10) * 10)} m`
  const km = meters / 1000
  return `a ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`
}

/** Cupo de un plan lleno (también lo dice la `PlanCard` al lector de pantalla). */
export const FULL_SPOTS_LABEL = 'Lleno'

/**
 * Cupo de un plan. `capacity: null` es cupo ilimitado.
 * @param {{ capacity: number | null, availableSpots: number | null, isFull: boolean }} plan
 */
export function formatSpots ({ capacity, availableSpots, isFull }) {
  if (capacity === null) return 'Sin límite de cupo'
  if (isFull) return FULL_SPOTS_LABEL
  return availableSpots === 1 ? 'Queda 1 lugar' : `Quedan ${availableSpots} lugares`
}

const dayText = (date) => `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
const timeText = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/**
 * Inscripciones: "3 de 10", o solo la cantidad si el cupo es ilimitado.
 * @param {{ participantCount: number, capacity: number | null }} plan
 */
export function formatJoined ({ participantCount, capacity }) {
  return capacity === null ? String(participantCount) : `${participantCount} de ${capacity}`
}

// Duración que se propone al elegir el fin de un plan: la mayoría dura un par de horas.
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

/**
 * Fecha que propone el selector de "Termina": dos horas después del inicio (o nada si todavía no hay inicio).
 * @param {Date | null} startsAt
 * @returns {Date | undefined}
 */
export function defaultEndsAt (startsAt) {
  return startsAt ? new Date(startsAt.getTime() + DEFAULT_DURATION_MS) : undefined
}

/** @param {Date} date @returns {string} "sáb 25/10 · 18:00" en la hora del teléfono. */
export function formatDateTime (date) {
  return `${dayText(date)} · ${timeText(date)}`
}

/**
 * Cuándo es el plan, en la hora del teléfono: "sáb 25/10 · 18:00 a 20:00", o con los dos días si termina otro día.
 * @param {string} startsAt ISO 8601
 * @param {string} endsAt ISO 8601
 */
export function formatSchedule (startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${dayText(start)} · ${timeText(start)} a ${timeText(end)}`
    : `${formatDateTime(start)} a ${formatDateTime(end)}`
}

// ── Formulario de crear / editar ─────────────────────────────────────────────────────────────────────────────────

/** Valores del formulario a partir de un plan guardado (o vacío para uno nuevo). */
export function formValuesFrom (plan) {
  return {
    title: plan?.title ?? '',
    description: plan?.description ?? '',
    startsAt: plan ? new Date(plan.startsAt) : null,
    endsAt: plan ? new Date(plan.endsAt) : null,
    locationLabel: plan?.location.label ?? '',
    coordinates: plan?.location.coordinates ?? null,
    // Un plan nuevo arranca con cupo definido; "Cupo ilimitado" es una elección explícita.
    isUnlimited: plan ? plan.capacity === null : false,
    capacity: plan?.capacity != null ? String(plan.capacity) : '',
    price: plan ? String(plan.price) : '0',
    interests: plan?.interests ?? []
  }
}

const WHOLE_NUMBER = /^\d+$/

/**
 * @param {ReturnType<typeof formValuesFrom>} values
 * @param {{ now?: Date, startChanged?: boolean }} [options]  Al editar, el inicio solo tiene que ser futuro si se cambió.
 * @returns {Record<string, string>} errores por campo (vacío si todo es válido).
 */
export function validatePlanForm (values, { now = new Date(), startChanged = true } = {}) {
  const errors = {}
  const title = values.title.trim()
  if (title.length < PLAN_LIMITS.TITLE_MIN) errors.title = `El título necesita al menos ${PLAN_LIMITS.TITLE_MIN} caracteres.`
  else if (title.length > PLAN_LIMITS.TITLE_MAX) errors.title = `El título admite hasta ${PLAN_LIMITS.TITLE_MAX} caracteres.`

  if (values.description.trim().length > PLAN_LIMITS.DESCRIPTION_MAX) {
    errors.description = `La descripción admite hasta ${PLAN_LIMITS.DESCRIPTION_MAX} caracteres.`
  }

  if (!values.startsAt) errors.startsAt = 'Elegí cuándo empieza.'
  else if (startChanged && values.startsAt.getTime() <= now.getTime()) errors.startsAt = 'El plan tiene que empezar en el futuro.'

  if (!values.endsAt) errors.endsAt = 'Elegí cuándo termina.'
  else if (values.startsAt) {
    const duration = values.endsAt.getTime() - values.startsAt.getTime()
    if (duration <= 0) errors.endsAt = 'El plan tiene que terminar después de empezar.'
    else if (duration > PLAN_LIMITS.MAX_DURATION_DAYS * DAY_MS) errors.endsAt = `El plan puede durar como máximo ${PLAN_LIMITS.MAX_DURATION_DAYS} días.`
  }

  if (!values.coordinates) errors.coordinates = 'Marcá el lugar en el mapa.'
  const label = values.locationLabel.trim()
  if (label === '') errors.locationLabel = 'Ingresá el nombre del lugar.'
  else if (label.length > PLAN_LIMITS.LABEL_MAX) errors.locationLabel = `El nombre del lugar admite hasta ${PLAN_LIMITS.LABEL_MAX} caracteres.`

  if (!values.isUnlimited) {
    const capacity = Number(values.capacity)
    if (!WHOLE_NUMBER.test(values.capacity.trim()) || capacity < 1 || capacity > PLAN_LIMITS.CAPACITY_MAX) {
      errors.capacity = `El cupo es un número entre 1 y ${PLAN_LIMITS.CAPACITY_MAX}, o activá "Cupo ilimitado".`
    }
  }

  const price = Number(values.price)
  if (!WHOLE_NUMBER.test(values.price.trim()) || price > PLAN_LIMITS.PRICE_MAX) {
    errors.price = `El costo es un número entero de 0 (gratis) a ${PLAN_LIMITS.PRICE_MAX}.`
  }

  if (values.interests.length === 0) errors.interests = 'Elegí al menos un tipo de actividad.'
  return errors
}

/** Body de POST /plans a partir de valores ya validados. Fechas ISO 8601 con zona (UTC) y coordenadas `[lng, lat]`. */
export function toPlanPayload (values) {
  const description = values.description.trim()
  return {
    title: values.title.trim(),
    ...(description !== '' ? { description } : {}),
    startsAt: values.startsAt.toISOString(),
    endsAt: values.endsAt.toISOString(),
    location: { label: values.locationLabel.trim(), type: 'Point', coordinates: values.coordinates },
    capacity: values.isUnlimited ? null : Number(values.capacity),
    price: Number(values.price),
    interests: values.interests
  }
}

const sameItems = (a, b) => a.length === b.length && a.every((item) => b.includes(item))

/**
 * Lo que cambió respecto del plan guardado (PATCH /plans/:id admite cambios parciales).
 * @param {object} plan  Plan guardado.
 * @param {ReturnType<typeof formValuesFrom>} values  Valores ya validados.
 * @returns {object} vacío si no cambió nada.
 */
export function planChanges (plan, values) {
  const next = toPlanPayload(values)
  const changes = {}
  if (next.title !== plan.title) changes.title = next.title
  if ((next.description ?? '') !== (plan.description ?? '')) changes.description = next.description ?? ''
  if (new Date(plan.startsAt).getTime() !== values.startsAt.getTime()) changes.startsAt = next.startsAt
  if (new Date(plan.endsAt).getTime() !== values.endsAt.getTime()) changes.endsAt = next.endsAt
  const [lng, lat] = plan.location.coordinates
  if (next.location.label !== plan.location.label || next.location.coordinates[0] !== lng || next.location.coordinates[1] !== lat) {
    changes.location = next.location
  }
  if (next.capacity !== plan.capacity) changes.capacity = next.capacity
  if (next.price !== plan.price) changes.price = next.price
  if (!sameItems(next.interests, plan.interests)) changes.interests = next.interests
  return changes
}

// ── Feedback del envío ───────────────────────────────────────────────────────────────────────────────────────────

/** Campos del formulario en el orden en que se ven: ordena el resumen de errores y elige a cuál scrollear. */
export const PLAN_FORM_FIELDS = Object.freeze(['title', 'description', 'startsAt', 'endsAt', 'coordinates', 'locationLabel', 'capacity', 'price', 'interests'])

/**
 * Campos con error, en orden visual. Ignora claves que el formulario no pinta.
 * @param {Record<string, string | undefined>} errors
 * @returns {string[]}
 */
export function planFormIssues (errors) {
  return PLAN_FORM_FIELDS.filter((name) => errors[name])
}

// Más de esto y el resumen ocuparía media pantalla con texto grande: el resto se cuenta.
const MAX_LISTED_ISSUES = 3

/**
 * Lista de campos para el resumen de errores: "Título.", "Título y Empieza.", "Título, Empieza, Termina y 4 más.".
 * @param {string[]} labels  Nombres de los campos, ya en orden visual.
 * @param {(count: number) => string} more  "y 4 más".
 */
export function formatIssueList (labels, more) {
  if (labels.length === 0) return ''
  if (labels.length > MAX_LISTED_ISSUES) return `${labels.slice(0, MAX_LISTED_ISSUES).join(', ')} ${more(labels.length - MAX_LISTED_ISSUES)}.`
  if (labels.length === 1) return `${labels[0]}.`
  return `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}.`
}

// Diferencia (px) por debajo de la cual no vale la pena mover el scroll.
const SCROLL_TOLERANCE = 4

/**
 * Hasta dónde scrollear para que un bloque se vea entero.
 * @param {{ y: number, height: number }} block  Posición dentro del contenido del ScrollView.
 * @param {{ offset: number, viewport: number }} view  Scroll actual y alto visible.
 * @param {{ align?: 'nearest' | 'top', margin?: number }} [options]  `nearest` mueve lo justo; `top` deja el bloque arriba.
 * @returns {number | null} y a la que scrollear, o null si ya se ve entero.
 */
export function scrollTargetY ({ y, height }, { offset, viewport }, { align = 'nearest', margin = spacing.xl } = {}) {
  const top = Math.max(0, y - margin)
  if (align === 'top') return Math.abs(offset - top) <= SCROLL_TOLERANCE ? null : top
  if (y >= offset + margin && y + height <= offset + viewport - margin) return null
  // Más alto que lo visible: se muestra desde arriba (la etiqueta y el comienzo del bloque).
  if (height > viewport - 2 * margin || y < offset + margin) return top
  return y + height - viewport + margin
}
