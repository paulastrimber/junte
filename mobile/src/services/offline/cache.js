// Caché de lecturas (S6-MOB-01): la última versión que mandó el servidor del feed, el detalle de un plan, "Mis planes",
// el historial del chat, los catálogos y el propio perfil. Sin conexión se muestran marcados como "sin conexión" con la
// hora en que se guardaron. Nunca es la fuente de verdad: en cuanto hay red se vuelve a pedir todo.
import { toApiError } from '../api/client.js'
import { CLIENT_ERROR_CODES, ApiError } from '../api/errors.js'

/** Cuántas entradas se guardan como máximo de cada tipo (las más viejas se borran). El resto es una por tipo. */
export const CACHE_LIMITS = Object.freeze({ plan: 30, chat: 20, feed: 5, myPlans: 4 })

const INDEX_KEY = '__index'

/** Falla de transporte: no hubo respuesta del servidor. Es la única que se resuelve con lo guardado. */
export const isTransportFailure = (error) => error?.code === CLIENT_ERROR_CODES.NETWORK_ERROR || error?.code === CLIENT_ERROR_CODES.TIMEOUT

/**
 * @param {object} deps
 * @param {ReturnType<import('./storage.js').createKeyValueStore>} deps.store
 * @param {() => Date} [deps.now]
 */
export function createReadCache ({ store, now = () => new Date() }) {
  // Las escrituras del índice van de a una: dos guardados a la vez no pierden entradas.
  let queue = Promise.resolve()
  const serialized = (task) => {
    queue = queue.then(task, task)
    return queue
  }

  /** Recorta las entradas del tipo de `key` (lo que va antes de `:`) a su máximo. */
  async function trim (key) {
    const group = key.split(':')[0]
    const limit = CACHE_LIMITS[group]
    if (!limit) return
    const index = (await store.read(INDEX_KEY)) ?? {}
    index[key] = now().getTime()
    const ofGroup = Object.entries(index).filter(([entry]) => entry.split(':')[0] === group).sort(([, a], [, b]) => b - a)
    for (const [stale] of ofGroup.slice(limit)) {
      delete index[stale]
      await store.remove(stale)
    }
    await store.write(INDEX_KEY, index)
  }

  return {
    /**
     * @param {string} key  P. ej. `plan:<id>`.
     * @param {any} data  Lo que devolvió el servidor (JSON).
     */
    save (key, data) {
      return serialized(async () => {
        await store.write(key, { savedAt: now().toISOString(), data })
        await trim(key)
      })
    },

    /** @returns {Promise<{ savedAt: string, data: any } | null>} */
    async load (key) {
      const entry = await store.read(key)
      return entry && entry.data !== undefined ? entry : null
    },

    /** Borra todo lo guardado (al cerrar sesión: es información de esa cuenta). */
    clear () {
      return serialized(() => store.removeAll())
    }
  }
}

/**
 * Lee del servidor y guarda la respuesta; si no hay conexión (o la request falla por red), devuelve lo guardado.
 * @template T
 * @param {object} params
 * @param {string} params.key
 * @param {() => Promise<T>} params.fetch
 * @param {ReturnType<typeof createReadCache>} params.cache
 * @param {{ isOnline: () => boolean }} params.connectivity
 * @returns {Promise<{ data: T, savedAt: string | null }>}  `savedAt` solo si vino de la caché.
 * @throws {ApiError} el error del servidor, o NETWORK_ERROR si no hay conexión ni nada guardado.
 */
export async function readThrough ({ key, fetch, cache, connectivity }) {
  const fromCache = async (error) => {
    const cached = await cache.load(key)
    if (cached) return { data: cached.data, savedAt: cached.savedAt }
    throw error
  }

  if (!connectivity.isOnline()) return fromCache(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
  try {
    const data = await fetch()
    // En segundo plano: guardar no demora la pantalla.
    cache.save(key, data)
    return { data, savedAt: null }
  } catch (failure) {
    const error = toApiError(failure)
    if (isTransportFailure(error)) return fromCache(error)
    throw error
  }
}
