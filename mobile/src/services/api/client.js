import axios, { AxiosError } from 'axios'

import { API_TIMEOUT_MS, getConfig } from '../../config/index.js'
import { ApiError, CLIENT_ERROR_CODES, defaultMessageFor, fallbackCodeForStatus } from './errors.js'

const REQUEST_ID_HEADER = 'x-request-id'

// TODO(S2-MOB-01/S2-MOB-02): interceptor de request con `Authorization: Bearer <access>` y
// refresh ante 401 con una sola request de refresh en vuelo. Fuera de alcance del sprint 1.

/**
 * Crea una instancia de axios cuyas fallas SIEMPRE rechazan con ApiError.
 * @param {object} params
 * @param {string} params.baseURL  URL base de la API (incluye /api/v1).
 * @param {number} [params.timeout] Milisegundos antes de abortar con TIMEOUT.
 * @returns {import('axios').AxiosInstance}
 */
export function createApiClient ({ baseURL, timeout = API_TIMEOUT_MS }) {
  const client = axios.create({
    baseURL,
    timeout,
    headers: { Accept: 'application/json' },
    // Hace que un timeout llegue como ETIMEDOUT y no como ECONNABORTED (que también es "abortada").
    transitional: { clarifyTimeoutError: true }
  })

  client.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(toApiError(error))
  )

  return client
}

let defaultClient = null

/**
 * Cliente compartido por los services, configurado con la URL del perfil (src/config).
 * Se crea en el primer uso para que importar un service no exija la configuración.
 */
export function getApiClient () {
  defaultClient ??= createApiClient({ baseURL: getConfig().apiUrl })
  return defaultClient
}

/**
 * Traduce cualquier falla del cliente HTTP a ApiError { status, code, message, requestId }.
 * @param {unknown} error
 * @returns {ApiError}
 */
export function toApiError (error) {
  if (error instanceof ApiError) return error

  if (axios.isCancel(error)) {
    return new ApiError({ status: 0, code: CLIENT_ERROR_CODES.REQUEST_CANCELED })
  }

  const response = error?.response
  if (response) return fromResponse(response)

  if (error instanceof AxiosError) {
    const code = error.code === AxiosError.ETIMEDOUT
      ? CLIENT_ERROR_CODES.TIMEOUT
      : CLIENT_ERROR_CODES.NETWORK_ERROR
    return new ApiError({ status: 0, code })
  }

  // Error de programación (p. ej. en un transform): no exponemos su mensaje al usuario.
  return new ApiError({ status: 0, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR })
}

/** @param {import('axios').AxiosResponse} response */
function fromResponse (response) {
  const { status } = response
  const body = parseBody(response.data)
  const hasCatalogShape = typeof body?.code === 'string' && body.code !== ''
  const code = hasCatalogShape ? body.code : fallbackCodeForStatus(status)
  const message = hasCatalogShape && typeof body.message === 'string' && body.message !== ''
    ? body.message
    : defaultMessageFor(code)

  return new ApiError({
    status,
    code,
    message,
    requestId: readRequestId(body, response.headers),
    details: hasCatalogShape ? body.details : undefined
  })
}

/**
 * axios deja el cuerpo como string si no es JSON válido (HTML de un ALB, texto de Nginx).
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
function parseBody (data) {
  if (data !== null && typeof data === 'object') return data
  if (typeof data !== 'string' || data === '') return null
  try {
    const parsed = JSON.parse(data)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    // No es JSON: se usa el código por status. No se loguea el cuerpo (puede traer datos).
    return null
  }
}

/** El cuerpo manda; si no trae requestId, se usa el header que agrega Nginx. */
function readRequestId (body, headers) {
  if (typeof body?.requestId === 'string' && body.requestId !== '') return body.requestId
  const fromHeader = typeof headers?.get === 'function'
    ? headers.get(REQUEST_ID_HEADER)
    : headers?.[REQUEST_ID_HEADER] ?? headers?.['X-Request-Id']
  return typeof fromHeader === 'string' && fromHeader !== '' ? fromHeader : null
}
