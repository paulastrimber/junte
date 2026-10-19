// Cola de escrituras pendientes (S6-MOB-02): lo que la persona hizo sin conexión (inscribirse, darse de baja, un mensaje
// del chat, un reporte) queda guardado en el teléfono como "pendiente" y se manda solo cuando vuelve la red, de a uno y
// en orden. La UI NUNCA lo da por hecho antes de que el servidor lo acepte: si responde un error (p. ej. 409 PLAN_FULL
// porque el plan se llenó mientras tanto) queda como "no se pudo enviar" con el motivo, hasta que la persona lo descarte
// o lo reintente. El check-in nunca se encola (depende del momento y del lugar exactos).
import { toApiError } from '../api/client.js'
import { isTransportFailure } from './cache.js'

export const OUTBOX_TYPE = Object.freeze({ JOIN: 'join', LEAVE: 'leave', MESSAGE: 'message', REPORT: 'report' })
export const OUTBOX_STATUS = Object.freeze({ PENDING: 'pending', SENDING: 'sending', FAILED: 'failed' })

const ITEMS_KEY = 'items'
// Inscribirse y darse de baja del mismo plan, sin conexión, se anulan entre sí.
const OPPOSITE = Object.freeze({ [OUTBOX_TYPE.JOIN]: OUTBOX_TYPE.LEAVE, [OUTBOX_TYPE.LEAVE]: OUTBOX_TYPE.JOIN })

/** Respuestas que, al reintentar algo que quizás ya había llegado, significan "ya estaba hecho". */
const isAlreadyDone = (type, error) => type === OUTBOX_TYPE.JOIN && error.code === 'ALREADY_JOINED'

const plainError = (error) => ({ status: error.status, code: error.code, message: error.message, requestId: error.requestId ?? null })

const defaultId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * @typedef {object} OutboxItem
 * @property {string} id
 * @property {'join' | 'leave' | 'message' | 'report'} type
 * @property {object} payload  Lo necesario para mandarlo y para mostrarlo (p. ej. `planId`, `planTitle`, `text`).
 * @property {string} createdAt  ISO 8601
 * @property {'pending' | 'sending' | 'failed'} status
 * @property {{ status: number, code: string, message: string, requestId: string | null } | null} error  Si falló.
 */

/**
 * @param {object} deps
 * @param {ReturnType<import('./storage.js').createKeyValueStore>} deps.store
 * @param {Record<string, (payload: object) => Promise<any>>} deps.executors  Cómo se manda cada tipo (la API).
 * @param {{ isOnline: () => boolean }} deps.connectivity
 * @param {() => string} [deps.createId]
 * @param {() => Date} [deps.now]
 */
export function createOutbox ({ store, executors, connectivity, createId = defaultId, now = () => new Date() }) {
  /** @type {OutboxItem[]} */
  let items = []
  let loading = null
  let flushing = null
  const listeners = new Set()
  const settledListeners = new Set()

  /** Lo guardado de una sesión anterior. Lo que quedó "enviando" (la app se cerró en el medio) vuelve a pendiente. */
  function ensureLoaded () {
    loading ??= store.read(ITEMS_KEY).then((saved) => {
      const restored = Array.isArray(saved) ? saved.map((item) => (item.status === OUTBOX_STATUS.SENDING ? { ...item, status: OUTBOX_STATUS.PENDING } : item)) : []
      // Lo que se encoló mientras se leía no se pierde.
      items = [...restored, ...items.filter((item) => !restored.some((old) => old.id === item.id))]
      emit()
    })
    return loading
  }

  function emit () {
    const snapshot = items
    listeners.forEach((listener) => listener(snapshot))
  }

  async function commit (next) {
    items = next
    emit()
    await store.write(ITEMS_KEY, items)
  }

  const patch = (id, changes) => commit(items.map((item) => (item.id === id ? { ...item, ...changes } : item)))

  async function sendOne (item) {
    await patch(item.id, { status: OUTBOX_STATUS.SENDING, error: null })
    try {
      const result = await executors[item.type](item.payload)
      await commit(items.filter((entry) => entry.id !== item.id))
      settledListeners.forEach((listener) => listener(item, { ok: true, result }))
      return true
    } catch (failure) {
      const error = toApiError(failure)
      if (isTransportFailure(error)) {
        // Sigue sin conexión: queda pendiente y se corta la vuelta (el resto tampoco llegaría).
        await patch(item.id, { status: OUTBOX_STATUS.PENDING })
        return false
      }
      if (isAlreadyDone(item.type, error)) {
        await commit(items.filter((entry) => entry.id !== item.id))
        settledListeners.forEach((listener) => listener(item, { ok: true, result: null }))
        return true
      }
      await patch(item.id, { status: OUTBOX_STATUS.FAILED, error: plainError(error) })
      settledListeners.forEach((listener) => listener(item, { ok: false, error }))
      return true
    }
  }

  /**
   * Manda los pendientes de a uno, en el orden en que se hicieron. Si falla la red, para y espera al próximo intento
   * (cuando vuelve la conexión o la app vuelve a primer plano). Una sola vuelta a la vez.
   */
  function flush () {
    flushing ??= (async () => {
      await ensureLoaded()
      const attempted = new Set()
      while (connectivity.isOnline()) {
        const next = items.find((item) => item.status === OUTBOX_STATUS.PENDING && !attempted.has(item.id))
        if (!next) break
        attempted.add(next.id)
        if (!await sendOne(next)) break
      }
    })().finally(() => { flushing = null })
    return flushing
  }

  return {
    /**
     * Guarda una escritura para mandarla cuando haya conexión (y la intenta enseguida si ya hay).
     * Inscribirse y darse de baja del mismo plan se anulan entre sí, y no se repite una que ya está en la cola.
     * @param {'join' | 'leave' | 'message' | 'report'} type
     * @param {object} payload
     * @returns {Promise<{ item: OutboxItem | null, cancelled: boolean }>}  `cancelled`: anuló una opuesta que estaba en la cola.
     */
    async enqueue (type, payload) {
      await ensureLoaded()
      if (OPPOSITE[type]) {
        const opposite = items.find((item) => item.type === OPPOSITE[type] && item.payload.planId === payload.planId && item.status === OUTBOX_STATUS.PENDING)
        if (opposite) {
          await commit(items.filter((item) => item.id !== opposite.id))
          return { item: null, cancelled: true }
        }
        const same = items.find((item) => item.type === type && item.payload.planId === payload.planId && item.status !== OUTBOX_STATUS.FAILED)
        if (same) return { item: same, cancelled: false }
      }
      const item = { id: createId(), type, payload, createdAt: now().toISOString(), status: OUTBOX_STATUS.PENDING, error: null }
      await commit([...items, item])
      if (connectivity.isOnline()) flush()
      return { item, cancelled: false }
    },

    flush,

    /** Vuelve a intentar uno que falló. */
    async retry (id) {
      await ensureLoaded()
      if (!items.some((item) => item.id === id && item.status === OUTBOX_STATUS.FAILED)) return
      await patch(id, { status: OUTBOX_STATUS.PENDING, error: null })
      return flush()
    },

    /** Descarta uno (pendiente o que falló). Lo que se está mandando en este momento no se puede descartar. */
    async remove (id) {
      await ensureLoaded()
      await commit(items.filter((item) => item.id !== id || item.status === OUTBOX_STATUS.SENDING))
    },

    /** @returns {Promise<OutboxItem[]>} */
    async list () {
      await ensureLoaded()
      return items
    },

    /** Lo último conocido, sin esperar a leer el teléfono (para el primer render). */
    peek: () => items,

    /** @param {(items: OutboxItem[]) => void} listener  Cada cambio de la cola. @returns {() => void} */
    subscribe (listener) {
      listeners.add(listener)
      ensureLoaded()
      return () => listeners.delete(listener)
    },

    /**
     * Cada vez que el servidor acepta o rechaza algo de la cola.
     * @param {(item: OutboxItem, outcome: { ok: true, result: any } | { ok: false, error: import('../api/errors.js').ApiError }) => void} listener
     * @returns {() => void}
     */
    onSettled (listener) {
      settledListeners.add(listener)
      return () => settledListeners.delete(listener)
    },

    /** Borra todo (al cerrar sesión: son acciones de esa cuenta). */
    async clear () {
      await ensureLoaded()
      await commit([])
    }
  }
}
