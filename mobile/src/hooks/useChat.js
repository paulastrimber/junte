import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMessages, sendMessage } from '../services/api/messages.js'
import { OUTBOX_STATUS, OUTBOX_TYPE, connectivity, isTransportFailure, outbox, readCache, readThrough } from '../services/offline/index.js'
import { SOCKET_STATUS, socketService } from '../services/socket.js'
import { uploadVoiceNote } from '../services/voiceNotes.js'
import { MESSAGE_STATUS, createClientId, mergeMessages, mergeRecoveredPage, sortMessages } from '../utils/chat.js'
import { CHAT_ERROR_MESSAGES, toViewError } from '../utils/errorMessages.js'
import { useIsForeground } from './useOffline.js'

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
  loadOlderError: null,
  savedAt: null
})

const authorView = (author) => (author ? { id: author.id, name: author.name ?? null, photoUrl: author.photoUrl ?? null, reputation: author.reputation ?? 0 } : null)

/** Un mensaje de la cola de pendientes (S6-MOB-02) como mensaje de la lista: pendiente, o fallido con su error. */
function fromOutbox (item, author) {
  const failed = item.status === OUTBOX_STATUS.FAILED
  return {
    id: `local-${item.payload.clientId}`,
    planId: item.payload.planId,
    sender: authorView(author),
    type: 'text',
    text: item.payload.text,
    clientId: item.payload.clientId,
    createdAt: item.createdAt,
    status: failed ? MESSAGE_STATUS.FAILED : MESSAGE_STATUS.PENDING,
    queued: !failed,
    error: item.error ? chatError(new ApiError(item.error)) : null
  }
}

/** Suma los pendientes de la cola que la lista todavía no tiene (p. ej. al reabrir la app). */
function withQueued (messages, queued) {
  const known = new Set(messages.map((message) => message.clientId).filter(Boolean))
  return sortMessages([...messages, ...queued.filter((message) => !known.has(message.clientId))])
}

/**
 * Chat de un plan: historial por REST, mensajes nuevos por Socket.io y respaldo por REST.
 * - Lista ordenada del más nuevo al más viejo (para una lista invertida), sin duplicados: se fusiona por `id` y por
 *   `clientId` (el mensaje propio pendiente se reemplaza por el confirmado).
 * - `send` muestra el mensaje enseguida como pendiente y lo manda por el socket; si no hay conexión o el ack no llega,
 *   por REST con el mismo `clientId`. Si tampoco hay red, queda en la cola de pendientes y se manda solo cuando vuelve
 *   (S6-MOB-02). Si el servidor lo rechaza, queda marcado para reintentar.
 * - Al reconectar vuelve a pedir la primera página (recupera lo que pasó mientras no había conexión). Si el WebSocket
 *   no se sostiene, hace polling mientras la pantalla esté activa. Con la app en segundo plano no hay socket ni polling.
 * - Sin conexión muestra el último historial guardado (`savedAt`). Un mensaje que oculta un admin desaparece solo.
 * @param {string} planId
 * @param {object} options
 * @param {{ id: string, name: string | null, photoUrl: string | null, reputation?: number } | null} options.user  Quien escribe (autor de los pendientes).
 * @param {boolean} [options.isActive]  La pantalla está en primer plano: solo entonces hace polling.
 * @param {string} [options.planTitle]  Para mostrar los pendientes fuera del chat.
 * Errores (`ViewError`): `error` (no se pudo cargar o se perdió el acceso), `loadOlderError` y el `error` de cada
 * mensaje que no se envió.
 */
export function useChat (planId, { user, isActive = true, planTitle = null }) {
  const [state, setState] = useState(INITIAL_STATE)
  const [socketStatus, setSocketStatus] = useState(() => socketService.getStatus())
  const isForeground = useIsForeground()
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

  const cacheKey = `chat:${planId}`

  /** Los mensajes de este plan que esperan en la cola de pendientes. */
  const queuedMessages = useCallback(async () => {
    const items = await outbox.list()
    return items
      .filter((item) => item.type === OUTBOX_TYPE.MESSAGE && item.payload.planId === planId)
      .map((item) => fromOutbox(item, userRef.current))
  }, [planId])

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    // Un "Reintentar" no pierde lo que la persona escribió y todavía no se confirmó (solo de este plan).
    setState((current) => ({ ...INITIAL_STATE, messages: current.messages.filter((message) => isUnsent(message) && message.planId === planId) }))
    try {
      const [{ data: page, savedAt }, queued] = await Promise.all([
        readThrough({ key: cacheKey, fetch: () => listMessages(planId, { limit: PAGE_SIZE }), cache: readCache, connectivity }),
        queuedMessages()
      ])
      if (generation !== generationRef.current) return
      // Pudo llegar algún mensaje por el socket mientras cargaba: se conserva. Lo guardado no se pagina hacia atrás.
      setState((current) => ({
        ...INITIAL_STATE,
        status: CHAT_STATUS.READY,
        messages: mergeMessages(withQueued(current.messages, queued), page.items),
        nextCursor: savedAt ? null : page.nextCursor,
        savedAt
      }))
    } catch (failure) {
      if (generation !== generationRef.current) return
      setState((current) => ({ ...INITIAL_STATE, status: CHAT_STATUS.ERROR, messages: current.messages, error: chatError(failure) }))
    }
  }, [planId, cacheKey, queuedMessages])

  useEffect(() => {
    const generations = generationRef
    isLoadingOlderRef.current = false
    load()
    return () => { generations.current++ }
  }, [load])

  // Vuelve a pedir la primera página y la fusiona. Es un trabajo de fondo: si falla se conserva lo que se ve y el
  // próximo intento (otra reconexión o el siguiente tick del polling) lo vuelve a pedir; solo importa perder el acceso.
  // De paso manda lo que haya quedado en la cola de pendientes.
  const recover = useCallback(async ({ refreshAudio = false } = {}) => {
    const generation = generationRef.current
    outbox.flush()
    try {
      const page = await listMessages(planId, { limit: PAGE_SIZE })
      if (generation !== generationRef.current) return
      readCache.save(cacheKey, page)
      setState((current) => {
        const { messages, isReplaced } = mergeRecoveredPage(current.messages, page, { refreshAudio })
        // Si se estaba mostrando lo guardado, el cursor para ir hacia atrás es el de la página nueva.
        const nextCursor = isReplaced || current.savedAt ? page.nextCursor : current.nextCursor
        // Sin nada nuevo (lo normal en cada tick del polling) se devuelve el mismo estado: React no vuelve a pintar.
        if (messages === current.messages && nextCursor === current.nextCursor && !current.savedAt) return current
        return { ...current, messages, nextCursor, savedAt: null }
      })
    } catch (failure) {
      if (generation !== generationRef.current) return
      const error = chatError(failure)
      if (ACCESS_LOST.has(error.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error }))
    }
  }, [planId, cacheKey])

  // La URL firmada de una nota de voz vence (10 min) y el merge conserva la que ya está: si el reproductor no puede
  // cargarla, se vuelve a pedir la primera página y se toman las URL nuevas. Solo alcanza a las notas recientes.
  const refreshAudio = useCallback(() => recover({ refreshAudio: true }), [recover])

  // El socket vive solo con la app en primer plano (S6-MOB-04): en segundo plano se suelta la sala (y, si era la
  // última, la conexión) y al volver se reconecta y recupera lo que pasó mientras tanto.
  useEffect(() => {
    if (!isForeground) {
      setSocketStatus(SOCKET_STATUS.IDLE)
      return undefined
    }
    const stopStatus = socketService.onStatusChange(setSocketStatus)
    const unsubscribe = socketService.subscribe(
      planId,
      (message) => setState((current) => {
        const messages = mergeMessages(current.messages, [message])
        return messages === current.messages ? current : { ...current, messages }
      }),
      (failure) => {
        if (ACCESS_LOST.has(failure?.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error: chatError(failure) }))
      },
      // Un admin lo ocultó: deja de verse (el historial ya no lo trae).
      (messageId) => setState((current) => ({ ...current, messages: current.messages.filter((message) => message.id !== messageId) }))
    )
    setSocketStatus(socketService.getStatus())
    return () => {
      stopStatus()
      unsubscribe()
    }
  }, [planId, isForeground])

  // Cada vez que el socket se conecta (la primera, o después de una caída) se recupera el historial reciente.
  useEffect(() => {
    if (socketStatus === SOCKET_STATUS.CONNECTED) recover()
  }, [socketStatus, recover])

  const isPolling = socketStatus === SOCKET_STATUS.UNAVAILABLE
  useEffect(() => {
    if (!isPolling || !isActive || !isForeground) return undefined
    const timer = setInterval(recover, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isPolling, isActive, isForeground, recover])

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

  const showAccessLost = useCallback((error) => {
    // Ya no tiene acceso (p. ej. se dio de baja con el chat abierto): reintentar no sirve, se muestra el error.
    if (ACCESS_LOST.has(error.code)) setState((current) => ({ ...current, status: CHAT_STATUS.ERROR, error }))
  }, [])

  // Lo que manda la cola de pendientes cuando vuelve la conexión.
  useEffect(() => outbox.onSettled((item, outcome) => {
    if (item.type !== OUTBOX_TYPE.MESSAGE || item.payload.planId !== planId) return
    if (outcome.ok) {
      if (outcome.result) setState((current) => ({ ...current, messages: mergeMessages(current.messages, [outcome.result]) }))
      return
    }
    const error = chatError(outcome.error)
    markUnsent(item.payload.clientId, { status: MESSAGE_STATUS.FAILED, queued: false, error })
    showAccessLost(error)
  }), [planId, markUnsent, showAccessLost])

  // Por el socket; si falla la conexión o no llega el ack, por REST con el mismo `clientId` (el servidor deduplica).
  const sendContent = useCallback(async ({ clientId, ...content }) => {
    try {
      return await socketService.sendChatMessage({ planId, clientId, ...content })
    } catch (failure) {
      if (!TRANSPORT_FAILURES.has(failure?.code)) throw failure
      return sendMessage(planId, { clientId, ...content })
    }
  }, [planId])

  /**
   * Nota de voz (S5-MOB-05): sube el audio (si todavía no se subió) y manda el mensaje. No pasa por la cola de
   * pendientes: sin conexión queda "No se envió" y se reintenta a mano (el archivo sigue en el teléfono).
   */
  const deliverVoice = useCallback(async ({ clientId, localUri, durationMs, audioKey }) => {
    try {
      if (!connectivity.isOnline()) throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
      let key = audioKey
      if (!key) {
        key = (await uploadVoiceNote({ planId, uri: localUri, durationMs })).audioKey
        markUnsent(clientId, { audioKey: key })
      }
      const saved = await sendContent({ clientId, type: 'voice', audioKey: key, durationMs: Math.max(1, Math.round(durationMs)) })
      setState((current) => ({ ...current, messages: mergeMessages(current.messages, [saved]) }))
    } catch (failure) {
      const error = chatError(failure)
      markUnsent(clientId, { status: MESSAGE_STATUS.FAILED, queued: false, error })
      showAccessLost(error)
    }
  }, [planId, sendContent, markUnsent, showAccessLost])

  const deliver = useCallback(async ({ clientId, text }) => {
    const enqueue = async () => {
      markUnsent(clientId, { status: MESSAGE_STATUS.PENDING, queued: true, error: null })
      await outbox.enqueue(OUTBOX_TYPE.MESSAGE, { planId, planTitle, text, clientId })
    }
    // Sin conexión ni se intenta: va directo a la cola.
    if (!connectivity.isOnline()) return enqueue()
    try {
      const saved = await sendContent({ clientId, text })
      setState((current) => ({ ...current, messages: mergeMessages(current.messages, [saved]) }))
    } catch (failure) {
      const error = chatError(failure)
      if (isTransportFailure(error)) return enqueue()
      markUnsent(clientId, { status: MESSAGE_STATUS.FAILED, queued: false, error })
      showAccessLost(error)
    }
  }, [planId, planTitle, sendContent, markUnsent, showAccessLost])

  const send = useCallback((text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const clientId = createClientId()
    const pending = {
      id: `local-${clientId}`,
      planId,
      sender: authorView(userRef.current),
      type: 'text',
      text: trimmed,
      clientId,
      createdAt: new Date().toISOString(),
      status: MESSAGE_STATUS.PENDING,
      queued: false,
      error: null
    }
    setState((current) => ({ ...current, messages: sortMessages([pending, ...current.messages]) }))
    deliver({ clientId, text: trimmed })
  }, [planId, deliver])

  /** Manda una nota de voz grabada (`uri` del archivo .m4a local). Se ve enseguida como pendiente. */
  const sendVoice = useCallback(({ uri, durationMs }) => {
    if (!uri) return
    const clientId = createClientId()
    const pending = {
      id: `local-${clientId}`,
      planId,
      sender: authorView(userRef.current),
      type: 'voice',
      text: null,
      localUri: uri,
      audioUrl: null,
      durationMs,
      clientId,
      createdAt: new Date().toISOString(),
      status: MESSAGE_STATUS.PENDING,
      queued: false,
      error: null
    }
    setState((current) => ({ ...current, messages: sortMessages([pending, ...current.messages]) }))
    deliverVoice({ clientId, localUri: uri, durationMs })
  }, [planId, deliverVoice])

  /** Reintenta un envío fallido con el mismo `clientId`: si en realidad el servidor lo había guardado, no se duplica. */
  const retrySend = useCallback(async (clientId) => {
    const failed = stateRef.current.messages.find((message) => message.clientId === clientId && message.status === MESSAGE_STATUS.FAILED)
    if (!failed) return
    // Si falló desde la cola de pendientes, se saca de ahí: el reintento va directo.
    const queued = (await outbox.list()).find((item) => item.type === OUTBOX_TYPE.MESSAGE && item.payload.clientId === clientId)
    if (queued) await outbox.remove(queued.id)
    markUnsent(clientId, { status: MESSAGE_STATUS.PENDING, error: null })
    if (failed.type === 'voice') return deliverVoice(failed)
    deliver({ clientId, text: failed.text })
  }, [markUnsent, deliver, deliverVoice])

  return {
    status: state.status,
    messages: state.messages,
    error: state.error,
    hasMore: state.nextCursor !== null,
    isLoadingOlder: state.isLoadingOlder,
    loadOlderError: state.loadOlderError,
    savedAt: state.savedAt,
    isPolling,
    send,
    sendVoice,
    retrySend,
    loadOlder,
    reload: load,
    refreshAudio
  }
}
