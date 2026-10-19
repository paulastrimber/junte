// Cliente de la API para el panel. Los tokens viven SOLO en memoria (nunca localStorage ni cookies): un XSS no los
// encuentra guardados y al recargar la página hay que volver a entrar (docs/arquitectura/04-front-service.md).
const BASE = '/api/v1'
const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED'])

let tokens = null // { accessToken, refreshToken }
let refreshing = null
let onSessionEnded = () => {}

export class ApiError extends Error {
  constructor ({ status, code, message, requestId }) {
    super(message || 'Ocurrió un error inesperado')
    this.status = status
    this.code = code
    this.requestId = requestId ?? null
  }
}

/** Avisa cuando la sesión terminó (refresh rechazado o cuenta sin permisos): el panel vuelve al login. */
export function onSessionEnd (callback) {
  onSessionEnded = callback
}

export const hasSession = () => tokens !== null

async function send (method, path, body, accessToken) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  } catch {
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'No pudimos conectarnos con el servidor.' })
  }
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.code ?? 'UNKNOWN_ERROR',
      message: data?.message,
      requestId: data?.requestId ?? response.headers.get('x-request-id')
    })
  }
  return data
}

/** Un solo refresh en vuelo: las requests que vencen a la vez esperan el mismo. */
function refreshOnce () {
  refreshing ??= send('POST', '/auth/refresh', { refreshToken: tokens.refreshToken })
    .then((next) => { tokens = { accessToken: next.accessToken, refreshToken: next.refreshToken } })
    .finally(() => { refreshing = null })
  return refreshing
}

/**
 * Request autenticada. Ante un 401 por token vencido renueva una vez y reintenta; si no se puede, termina la sesión.
 * @returns {Promise<any>}
 */
export async function api (method, path, body) {
  if (!tokens) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: 'Tenés que iniciar sesión.' })
  const sentToken = tokens.accessToken
  try {
    return await send(method, path, body, sentToken)
  } catch (error) {
    if (error.status !== 401 || !REFRESHABLE.has(error.code)) {
      // Un 401 que no se arregla renovando (p. ej. ACCOUNT_SUSPENDED) termina la sesión. Un 403 no: puede ser una
      // operación puntual no permitida (suspenderse a sí mismo) y se muestra como error.
      if (error.status === 401) endSession(error)
      throw error
    }
    try {
      if (tokens?.accessToken === sentToken) await refreshOnce()
    } catch (refreshError) {
      endSession(refreshError)
      throw refreshError
    }
    return send(method, path, body, tokens.accessToken)
  }
}

function endSession (error) {
  tokens = null
  onSessionEnded(error)
}

/**
 * Inicia sesión y comprueba que la cuenta sea admin (GET /admin/metrics). Si no lo es, cierra esa sesión.
 * @returns {Promise<object>} las métricas (la primera pantalla las usa).
 */
export async function login (email, password) {
  const session = await send('POST', '/auth/login', { email, password, deviceLabel: 'panel-admin' })
  tokens = { accessToken: session.accessToken, refreshToken: session.refreshToken }
  try {
    return await send('GET', '/admin/metrics', undefined, tokens.accessToken)
  } catch (error) {
    await logout()
    if (error.status === 403) {
      throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Esta cuenta no tiene permisos de administración.', requestId: error.requestId })
    }
    throw error
  }
}

/** Cierra la sesión en el back (si se puede) y borra los tokens de memoria. */
export async function logout () {
  const current = tokens
  tokens = null
  if (!current) return
  try {
    await send('POST', '/auth/logout', undefined, current.accessToken)
  } catch {
    // Si el access ya venció, la sesión del back vence sola; el panel igual la olvida.
  }
}
