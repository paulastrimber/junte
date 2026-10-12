// /plans. La identidad sale del token: la app nunca manda un creatorId.
import { getApiClient } from './client.js'

// En un query string las listas van separadas por comas (`interests=futbol,cine`) y `near` como `lng,lat`.
function toQuery ({ near, interests, priceRanges, ...rest }) {
  const query = { ...rest }
  if (near) query.near = `${near[0]},${near[1]}`
  if (interests?.length) query.interests = interests.join(',')
  if (priceRanges?.length) query.priceRanges = priceRanges.join(',')
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null))
}

/**
 * Listado de planes. Sin `near` va por fecha; con `near` va por recomendación (sin calendario).
 * @param {{ from?: string, to?: string, university?: string, interests?: string[], priceRanges?: string[],
 *   availability?: 'available' | 'full', near?: [number, number], radiusKm?: number, limit?: number, cursor?: string }} [params]
 * @returns {Promise<{ items: object[], nextCursor: string | null }>}
 */
export async function listPlans (params = {}, { client = getApiClient(), signal } = {}) {
  const { data } = await client.get('/plans', { params: toQuery(params), signal })
  return data
}

/** @returns {Promise<object>} detalle del plan */
export async function getPlan (id, { client = getApiClient(), signal } = {}) {
  const { data } = await client.get(`/plans/${encodeURIComponent(id)}`, { signal })
  return data
}

/**
 * @param {{ title: string, description?: string, startsAt: string, endsAt: string,
 *   location: { label: string, coordinates: [number, number] }, capacity: number | null, price: number, interests: string[] }} plan
 * @returns {Promise<object>} el plan creado
 */
export async function createPlan (plan, { client = getApiClient() } = {}) {
  const { data } = await client.post('/plans', plan)
  return data
}

/** Cambio parcial: solo lo que se manda. @returns {Promise<object>} el plan actualizado */
export async function updatePlan (id, changes, { client = getApiClient() } = {}) {
  const { data } = await client.patch(`/plans/${encodeURIComponent(id)}`, changes)
  return data
}

/**
 * Opciones de los filtros (rangos de precio y radio): se definen en el back, la app no las tiene escritas.
 * @returns {Promise<{ priceRanges: Array<{ key: string, min: number, max: number | null }>, radiusKm: { min: number, max: number, default: number } }>}
 */
export async function getPlanFilters ({ client = getApiClient() } = {}) {
  const { data } = await client.get('/plans/filters')
  return data
}
