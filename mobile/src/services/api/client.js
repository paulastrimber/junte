import axios, { AxiosError } from 'axios'

import { API_TIMEOUT_MS, getConfig } from '../../config/index.js'
import { ApiError, CLIENT_ERROR_CODES, defaultMessageFor, fallbackCodeForStatus } from './errors.js'

const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Sesión que el cliente necesita para autenticar y renovar. La implementa services/auth.js.
 * @typedef {object} ClientAuth
 * @property {() => string | null} getAccessToken  Access token vigente (en memoria).
 * @property {() => Promise<void>} refreshSession
 *   Renueva el par de tokens y lo guarda. Rechaza con ApiError; un 401 significa que la sesión terminó.
 * @property {(error: ApiError) => void} onSessionExpired  La sesión ya no se puede renovar: volver al login.
 */

const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED'])
const UNAUTHORIZED = 401

/**
 * Crea una instancia de axios cuyas fallas SIEMPRE rechazan con ApiError.
 *
 * Con `auth`, además:
 * - agrega `Authorization: Bearer <access>` (salvo en requests con `skipAuth: true`: login, register, refresh);
 * - ante un 401 `TOKEN_EXPIRED`/`UNAUTHENTICATED` renueva la sesión con UNA sola request de refresh en
 *   vuelo (las demás requests esperan esa misma promesa) y reintenta una vez cada request;
 * - si el refresh es rechazado (401) avisa con `onSessionExpired`; si falla por red, la sesión sigue.
 * @param {object} params
 * @param {string} params.baseURL  URL base de la API (incluye /api/v1).
 * @param {number} [params.timeout] Milisegundos antes de abortar con TIMEOUT.
 * @param {ClientAuth} [params.auth]
 * @returns {import('axios').AxiosInstance}
 */
export function createApiClient ({ baseURL, timeout = API_TIMEOUT_MS, auth }) {
  const client = axios.create({
    baseURL,
    timeout,
    headers: { Accept: 'application/json' },
    // Hace que un timeout llegue como ETIMEDOUT y no como ECONNABORTED (que también es "abortada").
    transitional: { clarifyTimeoutError: true }
  })

  if (auth) client.interceptors.request.use(attachAccessToken(auth))

  let refreshInFlight = null
  // Todas las requests que vencen mientras hay un refresh en vuelo esperan esta misma promesa.
  function refreshOnce () {
    refreshInFlight ??= auth.refreshSession()
      .catch((error) => {
        // Se avisa acá y no en cada request que espera: 3 requests = 1 aviso.
        if (error?.status === UNAUTHORIZED) auth.onSessionExpired(error)
        throw error
      })
      .finally(() => { refreshInFlight = null })
    return refreshInFlight
  }

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const apiError = toApiError(error)
      const config = error?.config
      if (!auth || !config || config.skipAuth || apiError.status !== UNAUTHORIZED) throw apiError

      if (apiError.code === 'ACCOUNT_SUSPENDED') {
        auth.onSessionExpired(apiError)
        throw apiError
      }
      if (!REFRESHABLE_CODES.has(apiError.code) || config.retried) throw apiError

      config.retried = true
      // Si otra request ya renovó el token después de que ésta saliera, alcanza con reintentar:
      // un segundo refresh rotaría de nuevo el refresh token sin necesidad.
      const current = auth.getAccessToken()
      if (!current || current === config.sentToken) await refreshOnce()
      return client.request(config)
    }
  )

  return client
}

function attachAccessToken (auth) {
  return (config) => {
    const token = config.skipAuth ? null : auth.getAccessToken()
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
      config.sentToken = token
    } else {
      config.headers.delete('Authorization')
    }
    return config
  }
}

let apiAuth = null

/**
 * Registra la sesión que usa el cliente compartido (lo hace App al arrancar). El cliente la consulta en
 * cada request, así que puede registrarse después de crearlo.
 * @param {ClientAuth | null} auth
 */
export function configureApiAuth (auth) {
  apiAuth = auth
}

let defaultClient = null

/**
 * Cliente compartido por los services, configurado con la URL del perfil (src/config).
 * Se crea en el primer uso para que importar un service no exija la configuración.
 */
export function getApiClient () {
  defaultClient ??= createApiClient({
    baseURL: getConfig().apiUrl,
    auth: {
      getAccessToken: () => apiAuth?.getAccessToken() ?? null,
      refreshSession: () => apiAuth.refreshSession(),
      onSessionExpired: (error) => apiAuth?.onSessionExpired(error)
    }
  })
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
