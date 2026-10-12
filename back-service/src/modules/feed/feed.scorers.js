// Criterios del score del feed (S3-BE-06). Cada uno es una función pura `(plan, ctx) → [0, 1]`.
// Agregar un criterio = una función acá + una línea en `buildScorers`; el servicio y el ranking no se tocan.

/**
 * Índice de Jaccard: |A ∩ B| / |A ∪ B|. Dos conjuntos vacíos no tienen nada en común → 0.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
export function jaccard (a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  const union = new Set([...setA, ...setB]).size
  if (union === 0) return 0
  let intersection = 0
  for (const item of setA) if (setB.has(item)) intersection++
  return intersection / union
}

/** @returns {boolean} true si los intervalos [startA, endA) y [startB, endB) se superponen. */
export function overlaps (startA, endA, startB, endB) {
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime()
}

/**
 * @typedef {object} ScoreContext
 * @property {string[]} userInterests
 * @property {number} radiusMeters
 * @property {Array<{ start: Date, end: Date, planId?: string }>} busy
 *   Franjas ocupadas: las del calendario que mandó la app + los planes en los que el usuario ya está inscripto.
 * @property {{ from: Date, to: Date } | null} calendarWindow
 *   Período del calendario que la app leyó; null si no hay permiso (o no lo mandó).
 */

/** Jaccard entre los intereses del usuario y los del plan. */
export const interestScorer = (plan, { userInterests }) => jaccard(userInterests, plan.interests ?? [])

/** P(d): 1 en distancia 0, lineal hasta 0 en el borde del radio. */
export const proximityScorer = (plan, { radiusMeters }) => Math.min(1, Math.max(0, 1 - plan.distanceMeters / radiusMeters))

/**
 * H(u, p): 0 si el plan se superpone con una franja ocupada; 1 si no se superpone y el calendario leído cubre todo el
 * horario del plan; 0.5 (neutral) si no se sabe: sin permiso de calendario o plan fuera del período leído.
 */
export function scheduleScorer (plan, { busy, calendarWindow }) {
  const isBusy = busy.some((slot) => slot.planId !== plan.id && overlaps(plan.startsAt, plan.endsAt, slot.start, slot.end))
  if (isBusy) return 0
  const isCovered = calendarWindow !== null &&
    plan.startsAt.getTime() >= calendarWindow.from.getTime() && plan.endsAt.getTime() <= calendarWindow.to.getTime()
  return isCovered ? 1 : 0.5
}

/**
 * Criterios con sus pesos (vienen de la configuración: FEED_WEIGHTS).
 * @param {{ interests: number, distance: number, schedule: number }} weights
 * @returns {Array<{ name: string, fn: (plan: object, ctx: ScoreContext) => number, weight: number }>}
 */
export function buildScorers (weights) {
  return [
    { name: 'interests', fn: interestScorer, weight: weights.interests },
    { name: 'distance', fn: proximityScorer, weight: weights.distance },
    { name: 'schedule', fn: scheduleScorer, weight: weights.schedule }
  ]
}

/**
 * Ordena los candidatos por score descendente. Desempates deterministas (más cerca, empieza antes, id) para que el
 * mismo conjunto dé siempre el mismo orden: la paginación depende de eso.
 * @template {{ id: string, distanceMeters: number, startsAt: Date }} P
 * @param {P[]} candidates
 * @param {ScoreContext} ctx
 * @param {ReturnType<typeof buildScorers>} scorers
 * @returns {Array<{ plan: P, score: number }>}
 */
export function rankPlans (candidates, ctx, scorers) {
  return candidates
    .map((plan) => ({ plan, score: scorers.reduce((sum, { fn, weight }) => sum + weight * fn(plan, ctx), 0) }))
    .sort((a, b) =>
      (b.score - a.score) ||
      (a.plan.distanceMeters - b.plan.distanceMeters) ||
      (a.plan.startsAt.getTime() - b.plan.startsAt.getTime()) ||
      (a.plan.id < b.plan.id ? -1 : a.plan.id > b.plan.id ? 1 : 0))
}
