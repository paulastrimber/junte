// Coordenadas y radio de búsqueda. Convención de la API: GeoJSON, siempre `[lng, lat]`.
import { z } from './validation.js'

/** Radio del feed (`radiusKm`): docs/pendientes.md#radio-del-feed. */
export const RADIUS_KM = Object.freeze({ MIN: 0.5, MAX: 50, DEFAULT: 10 })

const lng = z.number().min(-180).max(180)
const lat = z.number().min(-90).max(90)

/** `[lng, lat]` en un body JSON. */
export const lngLatField = z.tuple([lng, lat], { error: 'Las coordenadas deben ser [lng, lat]' })

const DECIMAL = /^-?\d{1,3}(\.\d{1,15})?$/

/** `near=lng,lat` en un query string → `[lng, lat]`. */
export const lngLatQueryField = z.string().max(60)
  .transform((text, ctx) => {
    const parts = text.split(',')
    if (parts.length !== 2 || !parts.every((part) => DECIMAL.test(part))) {
      ctx.addIssue({ code: 'custom', message: 'near debe tener la forma lng,lat' })
      return z.NEVER
    }
    return parts.map(Number)
  })
  .pipe(lngLatField)

const radiusRange = (schema) => schema
  .min(RADIUS_KM.MIN, { error: `El radio mínimo es ${RADIUS_KM.MIN} km` })
  .max(RADIUS_KM.MAX, { error: `El radio máximo es ${RADIUS_KM.MAX} km` })

/** `radiusKm` en un body JSON (número). */
export const radiusKmField = radiusRange(z.number())

/** `radiusKm` en un query string (texto → número). */
export const radiusKmQueryField = radiusRange(z.coerce.number())

const EARTH_RADIUS_METERS = 6_371_008.8
const toRadians = (degrees) => (degrees * Math.PI) / 180

/**
 * Distancia en metros entre dos puntos `[lng, lat]` (fórmula de Haversine). Función pura: la usa el check-in.
 * @param {[number, number]} from  `[lng, lat]`.
 * @param {[number, number]} to  `[lng, lat]`.
 * @returns {number}
 */
export function haversineMeters ([fromLng, fromLat], [toLng, toLat]) {
  const dLat = toRadians(toLat - fromLat)
  const dLng = toRadians(toLng - fromLng)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}
