// Feed por cercanía con recomendación (S3-BE-05 a 07). No importa Express ni Mongoose.
//
// Paginación (docs/pendientes.md#paginación-del-feed): el orden es por score, que no es un campo indexado. En cada
// página se traen los candidatos (hasta MAX_CANDIDATES, los más cercanos dentro del radio), se rankean y el cursor
// opaco guarda la posición en ese ranking, el instante de la primera página (`asOf`: el conjunto de candidatos queda
// fijo aunque se creen planes o empiecen otros) y una huella de la consulta (un cursor de otra consulta es 400).
// Nada se guarda en el back entre páginas (regla 11) y las franjas del calendario no se persisten ni se loguean.
import { createHash } from 'node:crypto'
import { RADIUS_KM } from '../../shared/geo.js'
import { errors } from '../../shared/errors.js'
import { cursorInstantField, decodeCursor, encodeCursor } from '../../shared/pagination.js'
import { z } from '../../shared/validation.js'
import { rankPlans } from './feed.scorers.js'

/** Tope de candidatos que se rankean por consulta. */
export const MAX_CANDIDATES = 200

const cursorSchema = z.strictObject({
  o: z.number().int().min(1).max(MAX_CANDIDATES), // posición en el ranking
  t: cursorInstantField, // asOf (ms)
  f: z.string().regex(/^[0-9a-f]{16}$/) // huella de la consulta
})

const fingerprintOf = (query) => createHash('sha256').update(JSON.stringify(query)).digest('hex').slice(0, 16)

/**
 * @param {object} deps
 * @param {{ findNearby: Function, findSchedulesByIds: Function }} deps.planRepo
 * @param {{ findById: (id: string) => Promise<object | null> }} deps.userRepo
 * @param {{ findActivePlanIds: (userId: string) => Promise<string[]> }} deps.participationRepo
 * @param {(plans: object[]) => Promise<Array<{ plan: object, creator: object | null }>>} deps.attachCreators
 * @param {ReturnType<import('./feed.scorers.js').buildScorers>} deps.scorers  Criterios con sus pesos.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 */
export function createFeedService ({ planRepo, userRepo, participationRepo, attachCreators, scorers, clock }) {
  // Los planes en los que el usuario ya está inscripto cuentan como ocupados, haya o no permiso de calendario.
  async function joinedPlanSlots (planIds, now) {
    const schedules = await planRepo.findSchedulesByIds(planIds, { endsAfter: now })
    return schedules.map(({ id, startsAt, endsAt }) => ({ planId: id, start: startsAt, end: endsAt }))
  }

  return {
    /**
     * @param {object} params
     * @param {string} params.userId  Del token.
     * @param {[number, number]} params.near  `[lng, lat]`.
     * @param {number} [params.radiusKm]
     * @param {import('../plans/index.js').PlanFilters} params.filters
     * @param {{ from: Date, to: Date, busy: Array<{ start: Date, end: Date }> } | null} [params.calendar]
     *   Franjas ocupadas del calendario del teléfono; sin permiso no se manda nada.
     * @param {number} params.limit
     * @param {string} [params.cursor]
     * @returns {Promise<{ items: Array<{ plan: object, creator: object | null }>, nextCursor: string | null }>}
     */
    async recommend ({ userId, near, radiusKm = RADIUS_KM.DEFAULT, filters, calendar = null, limit, cursor }) {
      const fingerprint = fingerprintOf({ near, radiusKm, filters, calendar })
      const position = cursor ? decodeCursor(cursor, cursorSchema) : null
      if (position && position.f !== fingerprint) {
        throw errors.validation([{ path: 'cursor', message: 'El cursor no corresponde a esta búsqueda' }])
      }
      const offset = position?.o ?? 0
      const asOf = position ? new Date(position.t) : clock.now()

      const user = await userRepo.findById(userId)
      if (!user) throw errors.unauthenticated()

      const radiusMeters = radiusKm * 1000
      const joinedPlanIds = await participationRepo.findActivePlanIds(userId)
      // El feed es para descubrir planes: no trae los que el usuario creó ni aquellos en los que ya está inscripto.
      const exclude = { creatorId: userId, planIds: joinedPlanIds }
      const [candidates, joinedSlots] = await Promise.all([
        planRepo.findNearby({ near, maxDistanceMeters: radiusMeters, filters, asOf, limit: MAX_CANDIDATES, exclude }),
        joinedPlanSlots(joinedPlanIds, asOf)
      ])

      const ranked = rankPlans(candidates, {
        userInterests: user.interests ?? [],
        radiusMeters,
        busy: [...(calendar?.busy ?? []), ...joinedSlots],
        calendarWindow: calendar ? { from: calendar.from, to: calendar.to } : null
      }, scorers)

      const page = ranked.slice(offset, offset + limit).map(({ plan }) => plan)
      const nextOffset = offset + limit
      const nextCursor = nextOffset < ranked.length ? encodeCursor({ o: nextOffset, t: asOf.getTime(), f: fingerprint }) : null
      return { items: await attachCreators(page), nextCursor }
    }
  }
}
