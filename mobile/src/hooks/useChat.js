import { useCallback, useEffect, useRef, useState } from 'react'

import { CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMessages, sendMessage } from '../services/api/messages.js'
import { SOCKET_STATUS, socketService } from '../services/socket.js'
import { MESSAGE_STATUS, createClientId, mergeMessages, mergeRecoveredPage, sortMessages } from '../utils/chat.js'
import { CHAT_ERROR_MESSAGES, toViewError } from '../utils/errorMessages.js'

export const CHAT_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', ERROR: 'error' })

const isUnsent = (message) => message.status === MESSAGE_STATUS.PENDING || message.status === MESSAGE_STATUS.FAILED

/** Cada cuánto se vuelve a pedir la primera página cuando el WebSocket no se puede sostener. */
export const POLL_INTERVAL_MS = 5_000
const PAGE_SIZE = 30

// Si el socket falla por conexión o timeout se reintenta por REST con el MISMO clientId (el servidor deduplica).
// Cualquier otro error (permiso, validación) es la respuesta real del servidor: no se reintenta por otro camino.
const TRANSPORT_FAILURES = new Set([CLIENT_ERROR_CODES.NETWORK_ERROR, CLIENT_ERROR_CODES.TIMEOUT])
// Se perdió el acceso al chat (p. ej. se dio de baja del plan): no hay nada que reintentar.
const ACCESS_LOST = new Set(['FORBIDDEN', 'NOT_FOUND'])

// Errores del chat listos para pintar: el mismo `code` (FORBIDDEN, NOT_FOUND…) significa otra cosa que en el resto
// de la app, por eso lleva sus propios textos.
const chatError = (failure) => toViewError(failure, CHAT_ERROR_MESSAGES)

const INITIAL_STATE = Object.freeze({
  status: CHAT_STATUS.LOADING,
  messages: [],
  nextCursor: null,
  error: null,
  isLoadingOlder: false,
  loadOlderError: null
})

/**
 * Chat de un plan: historial por REST, mensajes nuevos por Socket.io y respaldo por REST.
 * - Lista ordenada del más nuevo al más viejo (para una lista invertida), sin duplicados: se fusiona por `id` y por
 *   `clientId` (el mensaje propio pendiente se reemplaza por el confirmado).
 * - `send` muestra el mensaje enseguida como pendiente y lo manda por el socket; si no hay conexión o el ack no llega,
 *   por REST con el mismo `clientId`. Si falla queda marcado para reintentar.
 * - Al reconectar vuelve a pedir la primera página (recupera lo que pasó mientras no había conexión). Si el WebSocket
 *   no se sostiene, hace polling mientras la pantalla esté activa.
 * @param {string} planId
 * @param {object} options
 * @param {{ id: string, name: string | null, photoUrl: string | null, reputation?: number } | null} options.user  Quien escribe (autor de los pendientes).
 * @param {boolean} [options.isActive]  La pantalla está en primer plano: solo entonces hace polling.
 * Errores (`ViewError`): `error` (no se pudo cargar o se perdió el acceso), `loadOlderError` y el `error` de cada
 * mensaje que no se envió.
 */
export function useChat (planId, { user, isActive = true }) {
  const [state, setState] = useState(INITIAL_STATE)
  const [socketStatus, setSocketStatus] = useState(() => socketService.getStatus())
  // Las funciones estables leen el estado más reciente sin recrearse en cada render.
  const stateRef = useRef(state)
  const userRef = useRef(user)
  const isLoadingOlderRef = useRef(false)
  // Las respuestas de una consulta anterior (cambió el plan, se recargó o se desmontó) se descartan.
  const generationRef = useRef(0)
  useEffect(() => {
    stateRef.current = state
    userRef.current = user
  })

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    // Un "Reintentar" no pierde lo que la persona escribió y todavía no se confirmó (solo de este plan).
    setState((current) => ({ ...INITIAL_STATE, messages: current.messages.filter((message) => isUnsent(message) && message.planId === planId) }))
    try {
      const page = await listMessages(planId, { limit: PAGE_SIZE })
      if (generation !== generationRef.current) return
      // Pudo llegar algún mensaje por el socket mientras cargaba: se conserva.
      setState((current) => ({ ...INITIAL_STATE, status: CHAT_STATUS.READY, messages: mergeMessages(current.messages, page.items), nextCursor: page.nextCursor }))
    } catch (failure) {
      if (generation !== generationRef.current) return
      setState((current) => ({ ...INITIAL_STATE, status: CHAT_STATUS.ERROR, messages: current.messages, error: chatError(failure) }))
    }
  }, [planId])

  useEffect(() => {
    const generations = generationRef
    isLoadingOlderRef.current = false
    load()
    return () => { generations.current++ }
  }, [load])

  // Vuelve a pedir la primera página y la fusiona. Es un trabajo de fondo: si falla se conserva lo que se ve y el
  // próximo intento (otra reconexión o el siguiente tick del polling) lo vuelve a pedir; solo importa perder el acceso.
  const recover = useCallback(async () => {
    const generation = generationRef.current
    try {
      const page = await listMessages(planId, { limit: PAGE_SIZE })
      if (generation !== generationRef.current) return
      setState((current) => {
        const { messages, isReplaced } = mergeRecoveredPage(current.messages, page)
        const nextCursor = isReplaced ? page.nextCursor : current.nextCursor
        // Sin nada nuevo (lo normal en cada tick del polling) se devuelve el mismo estado: React no vuelve a pintar.
        if (messages === current.messages && nextCursor === current.nextCursor) return current
        return { ...current, messages, nextCursor }
      })
    } catch (failure) {
      if (generation !== generationRef.current) return
      const error = chatError(failure)
      if (ACCESS_LOST.has(error.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error }))
    }
  }, [planId])

  useEffect(() => {
    const stopStatus = socketService.onStatusChange(setSocketStatus)
    const unsubscribe = socketService.subscribe(
      planId,
      (message) => setState((current) => {
        const messages = mergeMessages(current.messages, [message])
        return messages === current.messages ? current : { ...current, messages }
      }),
      (failure) => {
        if (ACCESS_LOST.has(failure?.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error: chatError(failure) }))
      }
    )
    setSocketStatus(socketService.getStatus())
    return () => {
      stopStatus()
      unsubscribe()
    }
  }, [planId])

  // Cada vez que el socket se conecta (la primera, o después de una caída) se recupera el historial reciente.
  useEffect(() => {
    if (socketStatus === SOCKET_STATUS.CONNECTED) recover()
  }, [socketStatus, recover])

  const isPolling = socketStatus === SOCKET_STATUS.UNAVAILABLE
  useEffect(() => {
    if (!isPolling || !isActive) return undefined
    const timer = setInterval(recover, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPolling, isActive, recover])

  const loadOlder = useCallback(async () => {
    const { status, nextCursor } = stateRef.current
    if (status !== CHAT_STATUS.READY || !nextCursor || isLoadingOlderRef.current) return
    const generation = generationRef.current
    isLoadingOlderRef.current = true
    setState((current) => ({ ...current, isLoadingOlder: true, loadOlderError: null }))
    try {
      const page = await listMessages(planId, { limit: PAGE_SIZE, cursor: nextCursor })
      if (generation !== generationRef.current) return
      setState((current) => ({ ...current, messages: mergeMessages(current.messages, page.items), nextCursor: page.nextCursor, isLoadingOlder: false }))
    } catch (failure) {
      if (generation !== generationRef.current) return
      setState((current) => ({ ...current, isLoadingOlder: false, loadOlderError: toViewError(failure) }))
    } finally {
      if (generation === generationRef.current) isLoadingOlderRef.current = false
    }
  }, [planId])

  const markUnsent = useCallback((clientId, changes) => {
    setState((current) => ({
      ...current,
      messages: current.messages.map((message) => (message.clientId === clientId && message.status !== MESSAGE_STATUS.SENT ? { ...message, ...changes } : message))
    }))
  }, [])

  const deliver = useCallback(async ({ clientId, text }) => {
    try {
      let saved
      try {
        saved = await socketService.sendChatMessage({ planId, text, clientId })
      } catch (failure) {
        if (!TRANSPORT_FAILURES.has(failure?.code)) throw failure
        saved = await sendMessage(planId, { text, clientId })
      }
      setState((current) => ({ ...current, messages: mergeMessages(current.messages, [saved]) }))
    } catch (failure) {
      const error = chatError(failure)
      markUnsent(clientId, { status: MESSAGE_STATUS.FAILED, error })
      // Ya no tiene acceso (p. ej. se dio de baja con el chat abierto): reintentar no sirve, se muestra el error.
      if (ACCESS_LOST.has(error.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error }))
    }
  }, [planId, markUnsent])

  const send = useCallback((text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const clientId = createClientId()
    const author = userRef.current
    const pending = {
      id: `local-${clientId}`,
      planId,
      sender: author ? { id: author.id, name: author.name ?? null, photoUrl: author.photoUrl ?? null, reputation: author.reputation ?? 0 } : null,
      type: 'text',
      text: trimmed,
      clientId,
      createdAt: new Date().toISOString(),
      status: MESSAGE_STATUS.PENDING,
      error: null
    }
    setState((current) => ({ ...current, messages: sortMessages([pending, ...current.messages]) }))
    deliver({ clientId, text: trimmed })
  }, [planId, deliver])

  /** Reintenta un envío fallido con el mismo `clientId`: si en realidad el servidor lo había guardado, no se duplica. */
  const retrySend = useCallback((clientId) => {
    const failed = stateRef.current.messages.find((message) => message.clientId === clientId && message.status === MESSAGE_STATUS.FAILED)
    if (!failed) return
    markUnsent(clientId, { status: MESSAGE_STATUS.PENDING, error: null })
    deliver({ clientId, text: failed.text })
  }, [markUnsent, deliver])

  return {
    status: state.status,
    messages: state.messages,
    error: state.error,
    hasMore: state.nextCursor !== null,
    isLoadingOlder: state.isLoadingOlder,
    loadOlderError: state.loadOlderError,
    isPolling,
    send,
    retrySend,
    loadOlder,
    reload: load
  }
}
