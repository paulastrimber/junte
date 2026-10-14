// Conexión Socket.io del chat (S5-MOB-01): UNA sola para toda la app, creada en el primer uso y cerrada al soltar
// la última sala o al terminar la sesión. Es el "Model" del chat: no conoce pantallas ni hooks.
//
// Qué resuelve:
// - autentica con el access token y, si el servidor lo rechaza por vencido, renueva la sesión UNA vez y reconecta;
// - después de cada (re)conexión vuelve a entrar a las salas abiertas (el servidor las suelta al desconectar);
// - manda mensajes con acknowledgement y timeout;
// - informa el estado de la conexión para que el hook decida si hace falta polling.
import { io as defaultIo } from 'socket.io-client'

import { getConfig } from '../config/index.js'
import { originOf } from '../utils/url.js'
import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'
import { authService } from './auth.js'

/** Ruta de Socket.io detrás de Nginx (docs/arquitectura/08-tiempo-real-y-push.md). */
export const SOCKET_PATH = '/api/v1/socket.io'
/** Cuánto se espera el acknowledgement de un evento antes de darlo por perdido. */
export const ACK_TIMEOUT_MS = 8_000
/** Errores de conexión seguidos a partir de los cuales el WebSocket se considera "no disponible". */
export const MAX_CONSECUTIVE_FAILURES = 3
/** Espera antes de volver a conectar cuando Socket.io no reintenta solo (refresh sin red, o el servidor rechazó la conexión). */
export const AUTH_RETRY_DELAY_MS = 3_000

const JOIN_ATTEMPTS = 2
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED'])
const UNAUTHORIZED = 401

export const SOCKET_STATUS = Object.freeze({
  /** Sin conexión abierta (nadie la usa todavía, o ya se cerró). */
  IDLE: 'idle',
  /** Primer intento de conexión. */
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  /** Se cayó o falló algún intento: Socket.io sigue reintentando por su cuenta. */
  RECONNECTING: 'reconnecting',
  /** Fallaron varios intentos seguidos: la pantalla pasa a polling hasta que vuelva a conectar. */
  UNAVAILABLE: 'unavailable'
})

/** Error de un acknowledgement (`{ code, message, requestId }`) como ApiError. */
function errorFromAck (error) {
  return new ApiError({
    status: 0,
    code: typeof error?.code === 'string' ? error.code : CLIENT_ERROR_CODES.UNKNOWN_ERROR,
    message: typeof error?.message === 'string' ? error.message : undefined,
    requestId: error?.requestId ?? null
  })
}

/** Error de `connect_error` (`err.data = { code, message }`) como ApiError. */
function errorFromConnect (error) {
  return new ApiError({ status: UNAUTHORIZED, code: error?.data?.code ?? 'UNAUTHENTICATED', message: error?.data?.message ?? error?.message })
}

/**
 * @param {object} deps
 * @param {typeof defaultIo} [deps.io]  Fábrica de sockets de socket.io-client (inyectable para tests).
 * @param {() => string} [deps.getApiUrl]  URL base de la API; de ahí sale el origen del socket.
 * @param {import('./api/client.js').ClientAuth} deps.auth  Sesión: token vigente, refresh (el mismo de la API) y aviso de sesión terminada.
 * @param {number} [deps.ackTimeoutMs]
 * @param {number} [deps.maxFailures]
 * @param {number} [deps.authRetryDelayMs]
 */
export function createSocketService ({
  io = defaultIo,
  getApiUrl = () => getConfig().apiUrl,
  auth,
  ackTimeoutMs = ACK_TIMEOUT_MS,
  maxFailures = MAX_CONSECUTIVE_FAILURES,
  authRetryDelayMs = AUTH_RETRY_DELAY_MS
}) {
  let socket = null
  let status = SOCKET_STATUS.IDLE
  let failures = 0
  // Token con el que se hizo el último intento y si ya se renovó por un rechazo: se renueva UNA vez por rechazo.
  let attemptToken = null
  let hasRefreshed = false
  let retryTimer = null
  /** planId → suscriptores `{ onMessage, onJoinError }`. */
  const rooms = new Map()
  const statusListeners = new Set()

  function setStatus (next) {
    if (next === status) return
    status = next
    statusListeners.forEach((listener) => listener(next))
  }

  function registerFailure () {
    failures += 1
    setStatus(failures >= maxFailures ? SOCKET_STATUS.UNAVAILABLE : SOCKET_STATUS.RECONNECTING)
  }

  /** Entra a una sala. Un timeout se reintenta una vez; un error del servidor (p. ej. FORBIDDEN) se avisa a los suscriptores. */
  function join (planId, attempt = 1) {
    const current = socket
    current.timeout(ackTimeoutMs).emit('chat:join', { planId }, (timeoutError, response) => {
      if (socket !== current || !rooms.has(planId)) return
      if (timeoutError) {
        if (attempt < JOIN_ATTEMPTS && current.connected) join(planId, attempt + 1)
        return
      }
      if (response?.error) {
        const error = errorFromAck(response.error)
        rooms.get(planId).forEach(({ onJoinError }) => onJoinError?.(error))
      }
    })
  }

  function reconnectLater (current) {
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      if (socket === current) current.connect()
    }, authRetryDelayMs)
  }

  /**
   * El servidor rechazó el token. Se renueva la sesión una vez (la misma renovación única de la API) y se reconecta:
   * `auth` es una función, así que el nuevo intento ya lleva el token nuevo. Si vuelve a rechazarlo, la sesión no sirve.
   */
  async function recoverFromAuthError (current, error) {
    if (hasRefreshed) {
      disconnect()
      auth.onSessionExpired(errorFromConnect(error))
      return
    }
    hasRefreshed = true
    try {
      // Si otra request ya renovó el token después de este intento, alcanza con reconectar.
      if (auth.getAccessToken() === attemptToken) await auth.refreshSession()
    } catch (failure) {
      if (socket !== current) return
      if (failure?.status === UNAUTHORIZED) {
        disconnect()
        auth.onSessionExpired(failure)
        return
      }
      // Sin red para renovar: la sesión se conserva y se reintenta más tarde.
      hasRefreshed = false
      registerFailure()
      reconnectLater(current)
      return
    }
    if (socket === current) current.connect()
  }

  function handleConnectError (current, error) {
    const code = error?.data?.code
    if (code === 'ACCOUNT_SUSPENDED') {
      disconnect()
      auth.onSessionExpired(errorFromConnect(error))
      return
    }
    if (REFRESHABLE_CODES.has(code)) {
      setStatus(SOCKET_STATUS.RECONNECTING)
      recoverFromAuthError(current, error).catch(() => registerFailure())
      return
    }
    registerFailure()
    // Si lo rechazó el servidor (p. ej. INTERNAL con la base caída), Socket.io no reintenta solo (`active` queda en
    // false): sin esto el chat se quedaría sin tiempo real y sin llegar nunca al polling. Un error de red sí lo reintenta.
    if (!current.active) reconnectLater(current)
  }

  function ensureSocket () {
    if (socket) return socket
    const current = io(originOf(getApiUrl()), {
      path: SOCKET_PATH,
      transports: ['websocket'],
      // Función: se evalúa en CADA intento (también en las reconexiones), así siempre lleva el token vigente.
      auth: (callback) => {
        attemptToken = auth.getAccessToken()
        callback({ token: attemptToken })
      }
    })
    socket = current
    setStatus(SOCKET_STATUS.CONNECTING)

    current.on('connect', () => {
      failures = 0
      hasRefreshed = false
      setStatus(SOCKET_STATUS.CONNECTED)
      // El servidor suelta las salas al desconectar: hay que volver a entrar.
      rooms.forEach((_entries, planId) => join(planId))
    })
    current.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return
      setStatus(SOCKET_STATUS.RECONNECTING)
      // Si cortó el servidor, Socket.io no reintenta solo.
      if (reason === 'io server disconnect') current.connect()
    })
    current.on('connect_error', (error) => handleConnectError(current, error))
    current.on('chat:message', (message) => {
      rooms.get(message?.planId)?.forEach(({ onMessage }) => onMessage(message))
    })
    return current
  }

  /** Cierra la conexión y olvida las salas (logout, sesión vencida, o ya nadie escucha). Se puede volver a usar. */
  function disconnect () {
    clearTimeout(retryTimer)
    retryTimer = null
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = null
    }
    rooms.clear()
    failures = 0
    hasRefreshed = false
    setStatus(SOCKET_STATUS.IDLE)
  }

  return {
    /**
     * Escucha los mensajes de un plan. Abre la conexión si hace falta y entra a la sala (ahora o al conectar).
     * @param {string} planId
     * @param {(message: object) => void} onMessage  Cada `chat:message` de la sala, incluidos los propios.
     * @param {(error: ApiError) => void} [onJoinError]  El servidor no dejó entrar a la sala (FORBIDDEN, NOT_FOUND…).
     * @returns {() => void} dejar de escuchar; al soltar la última sala se cierra la conexión.
     */
    subscribe (planId, onMessage, onJoinError) {
      const entry = { onMessage, onJoinError }
      const isNewRoom = !rooms.has(planId)
      if (isNewRoom) rooms.set(planId, new Set())
      rooms.get(planId).add(entry)
      const current = ensureSocket()
      if (isNewRoom && current.connected) join(planId)

      return () => {
        const entries = rooms.get(planId)
        if (!entries?.delete(entry) || entries.size > 0) return
        rooms.delete(planId)
        if (rooms.size === 0) {
          disconnect()
        } else if (socket?.connected) {
          // Con ack vacío: el servidor lo invoca siempre.
          socket.emit('chat:leave', { planId }, () => {})
        }
      }
    },

    /**
     * Manda un mensaje y espera el acknowledgement.
     * @returns {Promise<object>} el mensaje guardado.
     * @throws {ApiError} NETWORK_ERROR si no hay conexión, TIMEOUT si no hubo ack, o el error que devolvió el servidor.
     */
    sendChatMessage ({ planId, text, clientId }) {
      if (!socket?.connected) return Promise.reject(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      return new Promise((resolve, reject) => {
        socket.timeout(ackTimeoutMs).emit('chat:send', { planId, text, clientId }, (timeoutError, response) => {
          if (timeoutError) return reject(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.TIMEOUT }))
          if (response?.ok && response.message) return resolve(response.message)
          reject(response?.error ? errorFromAck(response.error) : new ApiError({ status: 0, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR }))
        })
      })
    },

    getStatus: () => status,

    /** @param {(status: string) => void} listener @returns {() => void} cancelar suscripción */
    onStatusChange (listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },

    disconnect
  }
}

/** Servicio compartido de la app. Usa la misma sesión (y el mismo refresh único) que el cliente HTTP. */
export const socketService = createSocketService({ auth: authService.apiAuth })

// Al cerrar sesión (o vencerse) se suelta la conexión: el socket no puede sobrevivir al usuario.
authService.onSessionEnded(socketService.disconnect)
