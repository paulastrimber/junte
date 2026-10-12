// POST /feed: planes cercanos ordenados por recomendación. Va por body (no por query) para que la posición y las
// franjas del calendario no queden en logs de acceso.
import { getApiClient } from './client.js'

/**
 * @param {{ near: [number, number], radiusKm?: number, from?: string, to?: string, university?: string,
 *   interests?: string[], priceRanges?: string[], availability?: 'available' | 'full',
 *   calendar?: { from: string, to: string, busy: Array<{ start: string, end: string }> }, limit?: number, cursor?: string }} body
 *   `near` es `[lng, lat]`. `calendar` solo si hay permiso de calendario.
 * @returns {Promise<{ items: object[], nextCursor: string | null }>}
 */
export async function getFeed (body, { client = getApiClient(), signal } = {}) {
  const clean = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== null))
  const { data } = await client.post('/feed', clean, { signal })
  return data
}
