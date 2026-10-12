// Esquemas Zod de /plans. Estrictos: un campo desconocido (incluidos los solo-backend: `creatorId`, `participantCount`,
// `university`, `status`, `photoKey`…) es 400, no se descarta en silencio.
import { ATTENDANCE } from '../../shared/attendance.js'
import { MAX_INTERESTS } from '../../shared/catalog-keys.js'
import { lngLatField, lngLatQueryField, radiusKmQueryField } from '../../shared/geo.js'
import { cursorField, limitField } from '../../shared/pagination.js'
import { catalogKeyField } from '../../shared/profile-fields.js'
import { objectKeyPattern } from '../../shared/uploads.js'
import { instantField, isAfterOrUnknown, objectIdField, z } from '../../shared/validation.js'
import { AVAILABILITY, CREATOR_STATUSES, PLAN_LIMITS, PRICE_RANGE_KEYS } from './plan.rules.js'

const unique = (items) => new Set(items).size === items.length

const planFields = {
  title: z.string().trim().min(PLAN_LIMITS.TITLE_MIN).max(PLAN_LIMITS.TITLE_MAX),
  description: z.string().trim().max(PLAN_LIMITS.DESCRIPTION_MAX),
  startsAt: instantField,
  endsAt: instantField,
  // GeoJSON Point, siempre [lng, lat]. `type` es opcional en el body (solo puede ser 'Point').
  location: z.strictObject({
    label: z.string().trim().min(1).max(PLAN_LIMITS.LABEL_MAX),
    type: z.literal('Point').default('Point'),
    coordinates: lngLatField
  }),
  // Entero de 1 a 500, o null = cupo ilimitado.
  capacity: z.int().min(1).max(PLAN_LIMITS.CAPACITY_MAX).nullable(),
  // Pesos uruguayos, entero. 0 = gratis.
  price: z.int().min(0).max(PLAN_LIMITS.PRICE_MAX),
  // Keys del catálogo: acá solo la forma; que existan y la edad mínima lo decide el servicio contra la base.
  interests: z.array(catalogKeyField).min(PLAN_LIMITS.INTERESTS_MIN).max(MAX_INTERESTS)
    .refine(unique, { error: 'No repitas intereses' }),
  // Lo único del check-in que elige el creador; la ventana (`checkInOpensAt`/`checkInClosesAt`) la calcula el back.
  checkInRadiusMeters: z.int().min(ATTENDANCE.RADIUS_MIN_METERS).max(ATTENDANCE.RADIUS_MAX_METERS)
}

export const createPlanBody = z.strictObject({
  ...planFields,
  description: planFields.description.optional(),
  capacity: planFields.capacity.default(null),
  price: planFields.price.default(0),
  checkInRadiusMeters: planFields.checkInRadiusMeters.default(ATTENDANCE.RADIUS_DEFAULT_METERS)
})

// Si ya hay otros errores (campos desconocidos, valores inválidos) no se suman los de conjunto.
const whenOtherwiseValid = (payload) => payload.issues.length === 0

export const updatePlanBody = z.strictObject({
  ...planFields,
  // Cambio de estado que dispara el creador: cerrar o reabrir inscripciones, o cancelar. `completed` lo pone el back.
  status: z.enum(CREATOR_STATUSES)
}).partial()
  .refine((body) => Object.keys(body).length > 0, { error: 'Enviá al menos un campo para actualizar', when: whenOtherwiseValid })
  .refine((body) => body.status === undefined || Object.keys(body).length === 1, {
    error: 'El estado se cambia solo, sin otros campos',
    path: ['status'],
    when: whenOtherwiseValid
  })

export const myPlansQuery = z.strictObject({
  role: z.enum(['created', 'joined']),
  when: z.enum(['upcoming', 'past']).default('upcoming'),
  limit: limitField,
  cursor: cursorField.optional()
})

export const planIdParams = z.strictObject({ id: objectIdField })

export const setPlanPhotoBody = z.strictObject({
  objectKey: z.string().max(200).regex(objectKeyPattern('plans'), { error: 'La clave del objeto no es válida' })
})

// ── Filtros predefinidos de los listados (GET /plans y POST /feed) ───────────────────────────────────────────────
// El cliente solo elige VALORES de filtros conocidos; la query la arma el repositorio (regla 8).

const interestsFilter = z.array(catalogKeyField).min(1).max(MAX_INTERESTS).refine(unique, { error: 'No repitas intereses' })
const priceRangesFilter = z.array(z.enum(PRICE_RANGE_KEYS)).min(1).max(PRICE_RANGE_KEYS.length).refine(unique, { error: 'No repitas rangos de precio' })

// En un query string las listas van separadas por comas: `interests=futbol,cine`.
const csv = (schema) => z.string().max(1000).transform((text) => text.split(',')).pipe(schema)

const coherentDates = [
  ({ from, to }) => isAfterOrUnknown(to, from),
  { error: '"to" tiene que ser posterior a "from"', path: ['to'] }
]

/** Filtros tal como llegan en un body JSON (los usa POST /feed). */
export const planFilterBodyFields = {
  from: instantField.optional(),
  to: instantField.optional(),
  university: catalogKeyField.optional(),
  interests: interestsFilter.optional(),
  availability: z.enum(Object.values(AVAILABILITY)).default(AVAILABILITY.AVAILABLE),
  priceRanges: priceRangesFilter.optional()
}

export const coherentFilterDates = coherentDates

export const listPlansQuery = z.strictObject({
  ...planFilterBodyFields,
  interests: csv(interestsFilter).optional(),
  priceRanges: csv(priceRangesFilter).optional(),
  // Con `near` el listado se ordena por recomendación; sin `near`, por fecha.
  near: lngLatQueryField.optional(),
  radiusKm: radiusKmQueryField.optional(),
  limit: limitField,
  cursor: cursorField.optional()
})
  .refine(...coherentDates)
  .refine(({ near, radiusKm }) => radiusKm === undefined || near !== undefined, { error: 'radiusKm solo se usa junto con near', path: ['radiusKm'] })

/**
 * Se queda solo con los filtros (sin paginación ni ubicación), ya validados.
 * @returns {import('./plan.repository.js').PlanFilters}
 */
export function pickFilters ({ from, to, university, interests, availability, priceRanges }) {
  return { from, to, university, interests, availability, priceRanges }
}
