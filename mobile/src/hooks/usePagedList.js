import { useCallback, useEffect, useRef, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { connectivity, readCache, readThrough } from '../services/offline/index.js'

export const LIST_STATUS = Object.freeze({ IDLE: 'idle', LOADING: 'loading', READY: 'ready', ERROR: 'error' })

const stateFor = (status) => ({ status, items: [], nextCursor: null, error: null, isRefreshing: false, isLoadingMore: false, loadMoreError: null, savedAt: null })

/**
 * Lista paginada por cursor (`{ items, nextCursor }`): primera página, "cargar más" y refresco.
 * Las respuestas de una consulta anterior (cambió la consulta, se refrescó o se desmontó) se descartan.
 * Con `cacheKey`, la primera página se guarda en el teléfono y sin conexión se muestra la última guardada (con
 * `savedAt` y sin "cargar más": el cursor de esa página ya no sirve).
 * @param {(cursor: string | null) => Promise<{ items: object[], nextCursor: string | null }>} fetchPage
 *   Estable entre renders mientras la consulta sea la misma (`useCallback`): cuando cambia, se vuelve a pedir.
 * @param {{ enabled?: boolean, cacheKey?: string }} [options]  Con `enabled: false` no pide nada (p. ej. sin permiso para verla).
 */
export function usePagedList (fetchPage, { enabled = true, cacheKey } = {}) {
  const [state, setState] = useState(() => stateFor(enabled ? LIST_STATUS.LOADING : LIST_STATUS.IDLE))
  const generationRef = useRef(0)
  // `loadMore` lee el estado más reciente sin recrearse en cada render (FlatList lo llama desde onEndReached).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const loadFirstPage = useCallback(async ({ isRefreshing = false } = {}) => {
    const generation = ++generationRef.current
    setState((current) => (isRefreshing && current.status === LIST_STATUS.READY
      ? { ...current, isRefreshing: true, loadMoreError: null }
      : stateFor(LIST_STATUS.LOADING)))
    try {
      let page
      let savedAt = null
      if (cacheKey && !isRefreshing) {
        ({ data: page, savedAt } = await readThrough({ key: cacheKey, fetch: () => fetchPage(null), cache: readCache, connectivity }))
      } else {
        // Un refresco que falla conserva lo que ya se veía (abajo), no lo cambia por lo guardado.
        page = await fetchPage(null)
        if (cacheKey) readCache.save(cacheKey, page)
      }
      if (generation !== generationRef.current) return
      setState({ ...stateFor(LIST_STATUS.READY), items: page.items, nextCursor: savedAt ? null : page.nextCursor, savedAt })
    } catch (failure) {
      if (generation !== generationRef.current) return
      const error = toApiError(failure)
      // Si falla un refresco se conserva lo que ya se veía; si falla la primera carga, estado de error.
      setState((current) => (isRefreshing && current.status === LIST_STATUS.READY
        ? { ...current, isRefreshing: false, loadMoreError: error }
        : { ...stateFor(LIST_STATUS.ERROR), error }))
    }
  }, [fetchPage, cacheKey])

  useEffect(() => {
    const generations = generationRef
    if (enabled) loadFirstPage()
    else setState(stateFor(LIST_STATUS.IDLE))
    return () => { generations.current++ }
  }, [enabled, loadFirstPage])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== LIST_STATUS.READY || !current.nextCursor || current.isLoadingMore || current.isRefreshing) return

    const generation = generationRef.current
    setState((previous) => ({ ...previous, isLoadingMore: true, loadMoreError: null }))
    try {
      const page = await fetchPage(current.nextCursor)
      if (generation !== generationRef.current) return
      setState((previous) => {
        // Por las dudas: nunca dos filas con el mismo elemento.
        const known = new Set(previous.items.map((item) => item.id))
        const fresh = page.items.filter((item) => !known.has(item.id))
        return { ...previous, items: [...previous.items, ...fresh], nextCursor: page.nextCursor, isLoadingMore: false }
      })
    } catch (failure) {
      if (generation !== generationRef.current) return
      setState((previous) => ({ ...previous, isLoadingMore: false, loadMoreError: toApiError(failure) }))
    }
  }, [fetchPage])

  const refresh = useCallback(() => loadFirstPage({ isRefreshing: true }), [loadFirstPage])
  const retry = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { ...state, hasMore: state.nextCursor !== null, loadMore, refresh, retry }
}
