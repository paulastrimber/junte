import { getApiClient } from './client.js'
import { isApiError } from './errors.js'

// Se llama a GET /api/v1/health (Nginx lo reescribe a /internal/health del back) y no al
// /health de la raíz: ese lo responde Nginx con texto plano y solo dice que Nginx está vivo.
// Este recorre app → Nginx → back → MongoDB/Redis. Degradado es un 503 (MongoDB no responde) o un 200 con
// `status: 'degraded'` (Redis caído: la API sigue respondiendo y el chat va por polling).
const HEALTH_PATH = '/health'
const SERVICE_UNAVAILABLE = 503

export const HEALTH_STATUS = Object.freeze({
  OK: 'ok',
  DEGRADED: 'degraded'
})

/**
 * GET /health (bajo la URL base de la API, sin token).
 * @param {object} [options]
 * @param {import('axios').AxiosInstance} [options.client]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ status: 'ok' | 'degraded', requestId: string | null, error?: import('./errors.js').ApiError }>}
 * @throws {import('./errors.js').ApiError} ante cualquier falla que no sea un 503 (red, timeout, 5xx…).
 */
export async function getHealth ({ client = getApiClient(), signal } = {}) {
  try {
    const response = await client.get(HEALTH_PATH, { signal })
    const requestId = response.headers?.get?.('x-request-id') ?? null
    const status = response.data?.status === HEALTH_STATUS.DEGRADED ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.OK
    return { status, requestId }
  } catch (error) {
    // 503 = el back respondió pero MongoDB no: degradado, no caído.
    if (isApiError(error) && error.status === SERVICE_UNAVAILABLE) {
      return { status: HEALTH_STATUS.DEGRADED, requestId: error.requestId, error }
    }
    throw error
  }
}
