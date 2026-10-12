// Reglas puras de los planes (sin acceso a la base ni al reloj: el "ahora" llega por parámetro).
// Las usan el servicio, los validators y el modelo.

/** Límites del plan (los mismos en Zod, en el esquema de Mongoose y en el validador de la migración). */
export const PLAN_LIMITS = Object.freeze({
  TITLE_MIN: 3,
  TITLE_MAX: 100,
  DESCRIPTION_MAX: 2000,
  LABEL_MAX: 120,
  CAPACITY_MAX: 500,
  INTERESTS_MIN: 1,
  // Costo en pesos uruguayos, entero. 0 = gratis.
  PRICE_MAX: 100_000,
  // Duración máxima (endsAt − startsAt): permite campamentos de varios días.
  MAX_DURATION_MS: 7 * 24 * 60 * 60 * 1000
})

/**
 * Rangos de precio del filtro del feed, en pesos uruguayos (`max: null` = sin tope). ÚNICO lugar donde se definen:
 * el back arma la query con ellos y la app los recibe por `GET /plans/filters` (no los tiene escritos).
 * Tienen que cubrir todos los precios posibles sin superponerse.
 * @type {ReadonlyArray<{ key: string, min: number, max: number | null }>}
 */
export const PRICE_RANGES = Object.freeze([
  Object.freeze({ key: 'free', min: 0, max: 0 }),
  Object.freeze({ key: 'low', min: 1, max: 500 }),
  Object.freeze({ key: 'mid', min: 501, max: 1000 }),
  Object.freeze({ key: 'high', min: 1001, max: null })
])

export const PRICE_RANGE_KEYS = Object.freeze(PRICE_RANGES.map((range) => range.key))

/** Filtro de cupo: "lleno" se calcula (`participantCount >= capacity`), no es un status. */
export const AVAILABILITY = Object.freeze({ AVAILABLE: 'available', FULL: 'full' })

/** `capacity: null` es cupo ilimitado. */
export const hasUnlimitedCapacity = (plan) => plan.capacity === null || plan.capacity === undefined

/**
 * Un plan sin límite nunca está lleno.
 * @param {{ participantCount: number, capacity: number | null }} plan
 */
export const isFull = (plan) => !hasUnlimitedCapacity(plan) && plan.participantCount >= plan.capacity

/**
 * @param {{ participantCount: number, capacity: number | null }} plan
 * @returns {number | null} lugares libres; null si el cupo es ilimitado.
 */
export const availableSpots = (plan) => (hasUnlimitedCapacity(plan) ? null : Math.max(0, plan.capacity - plan.participantCount))

/** Estados en los que el creador todavía puede editar el plan. */
export const EDITABLE_STATUSES = Object.freeze(['open', 'closed'])

/** Estados "vivos": el plan admite bajas, QR y check-in, y el job todavía lo puede cerrar. */
export const LIVE_STATUSES = EDITABLE_STATUSES

/** @param {{ status: string }} plan */
export const isLive = (plan) => LIVE_STATUSES.includes(plan.status)

/**
 * Transiciones que dispara el creador (docs/tareas/s4-decisiones.md#4-estados-del-plan). `completed` lo pone solo
 * el job; `cancelled` y `completed` son finales. `until`: hasta cuándo se permite ('start' = antes de `startsAt`,
 * 'end' = antes de `endsAt`).
 * @type {Readonly<Record<string, { from: readonly string[], until: 'start' | 'end' }>>}
 */
export const STATUS_TRANSITIONS = Object.freeze({
  closed: Object.freeze({ from: Object.freeze(['open']), until: 'start' }),
  open: Object.freeze({ from: Object.freeze(['closed']), until: 'start' }),
  cancelled: Object.freeze({ from: Object.freeze(['open', 'closed']), until: 'end' })
})

export const CREATOR_STATUSES = Object.freeze(Object.keys(STATUS_TRANSITIONS))

/**
 * ¿El creador puede pasar el plan a `to` ahora?
 * @param {{ plan: { status: string, startsAt: Date, endsAt: Date }, to: string, now: Date }} params
 */
export function canTransition ({ plan, to, now }) {
  const transition = STATUS_TRANSITIONS[to]
  if (!transition || !transition.from.includes(plan.status)) return false
  const limit = transition.until === 'start' ? plan.startsAt : plan.endsAt
  return now.getTime() < limit.getTime()
}

const MAX_DURATION_DAYS = PLAN_LIMITS.MAX_DURATION_MS / (24 * 60 * 60 * 1000)
const problem = (path, message) => ({ path, message })

/**
 * Coherencia de las fechas del plan RESULTANTE (lo que quedaría guardado).
 * @param {object} params
 * @param {Date} params.startsAt
 * @param {Date} params.endsAt
 * @param {Date} params.now
 * @param {boolean} params.mustStartInFuture  Al crear, o cuando un PATCH cambia `startsAt`.
 * @returns {Array<{ path: string, message: string }>} problemas (vacío si es válido).
 */
export function checkSchedule ({ startsAt, endsAt, now, mustStartInFuture }) {
  const details = []
  if (mustStartInFuture && startsAt.getTime() <= now.getTime()) {
    details.push(problem('startsAt', 'El plan tiene que empezar en el futuro'))
  }
  const durationMs = endsAt.getTime() - startsAt.getTime()
  if (durationMs <= 0) {
    details.push(problem('endsAt', 'El plan tiene que terminar después de empezar'))
  } else if (durationMs > PLAN_LIMITS.MAX_DURATION_MS) {
    details.push(problem('endsAt', `El plan puede durar como máximo ${MAX_DURATION_DAYS} días`))
  }
  return details
}

/**
 * Visible para cualquier usuario: abierto o cerrado (inscripciones) y todavía no terminó. Los cancelados, completados
 * o ya terminados solo los ven su creador y sus inscriptos (eso lo resuelve el servicio).
 * Ver docs/pendientes.md#visibilidad-de-planes.
 * @param {{ status: string, endsAt: Date }} plan
 * @param {Date} now
 */
export function isPubliclyVisible (plan, now) {
  return (plan.status === 'open' || plan.status === 'closed') && plan.endsAt.getTime() > now.getTime()
}
