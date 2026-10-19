import { useCallback, useEffect, useRef, useState } from 'react'

import { toViewError } from '../utils/errorMessages.js'

export const LIST_STATUS = Object.freeze({ IDLE: 'idle', LOADING: 'loading', READY: 'ready', ERROR: 'error' })

const stateFor = (status) => ({ status, items: [], nextCursor: null, error: null, isRefreshing: false, refreshError: null, isLoadingMore: false, loadMoreError: null })

/**
 * Lista paginada por cursor (`{ items, nextCursor }`): primera página, "cargar más" y refresco.
 * Las respuestas de una consulta anterior (cambió la consulta, se refrescó o se desmontó) se descartan.
 * @param {(cursor: string | null) => Promise<{ items: object[], nextCursor: string | null }>} fetchPage
 *   Estable entre renders mientras la consulta sea la misma (`useCallback`): cuando cambia, se vuelve a pedir.
 * @param {{ enabled?: boolean }} [options]  Con `enabled: false` no pide nada (p. ej. sin permiso para verla).
 * @returns {{
 *   status: string, items: object[], hasMore: boolean, isRefreshing: boolean, isLoadingMore: boolean,
 *   error: import('../utils/errorMessages.js').ViewError | null,
 *   refreshError: import('../utils/errorMessages.js').ViewError | null,
 *   loadMoreError: import('../utils/errorMessages.js').ViewError | null,
 *   loadMore: () => Promise<void>, refresh: () => Promise<void>, retry: () => Promise<void>
 * }} `error`: falló la primera carga; `refreshError`: falló un refresco (se conservan los datos);
 *   `loadMoreError`: falló una página siguiente.
 */
export function usePagedList (fetchPage, { enabled = true } = {}) {
  const [state, setState] = useState(() => stateFor(enabled ? LIST_STATUS.LOADING : LIST_STATUS.IDLE))
  const generationRef = useRef(0)
  // `loadMore` lee el estado más reciente sin recrearse en cada render (FlatList lo llama desde onEndReached).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  // Guarda sincrónica de "cargar más": `stateRef` se actualiza recién después del commit, y dos `onEndReached`
  // seguidos antes de eso harían dos requests con el mismo cursor.
  const isLoadingMoreRef = useRef(false)

  const loadFirstPage = useCallback(async ({ isRefreshing = false } = {}) => {
    const generation = ++generationRef.current
    isLoadingMoreRef.current = false
    setState((current) => (isRefreshing && current.status === LIST_STATUS.READY
      ? { ...current, isRefreshing: true, refreshError: null, loadMoreError: null }
      : stateFor(LIST_STATUS.LOADING)))
    try {
      const page = await fetchPage(null)
      if (generation !== generationRef.current) return
      setState({ ...stateFor(LIST_STATUS.READY), items: page.items, nextCursor: page.nextCursor })
    } catch (failure) {
      if (generation !== generationRef.current) return
      const error = toViewError(failure)
      // Si falla un refresco se conserva lo que ya se veía; si falla la primera carga, estado de error.
      setState((current) => (isRefreshing && current.status === LIST_STATUS.READY
        ? { ...current, isRefreshing: false, refreshError: error }
        : { ...stateFor(LIST_STATUS.ERROR), error }))
    }
  }, [fetchPage])

  useEffect(() => {
    const generations = generationRef
    if (enabled) loadFirstPage()
    else setState(stateFor(LIST_STATUS.IDLE))
    return () => { generations.current++ }
  }, [enabled, loadFirstPage])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    if (current.status !== LIST_STATUS.READY || !current.nextCursor || current.isRefreshing || isLoadingMoreRef.current) return

    const generation = generationRef.current
    isLoadingMoreRef.current = true
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
      setState((previous) => ({ ...previous, isLoadingMore: false, loadMoreError: toViewError(failure) }))
    } finally {
      if (generation === generationRef.current) isLoadingMoreRef.current = false
    }
  }, [fetchPage])

  // Sin permiso para verla (`enabled: false`) no hay nada que refrescar.
  const refresh = useCallback(async () => {
    if (enabled) await loadFirstPage({ isRefreshing: true })
  }, [enabled, loadFirstPage])
  const retry = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { ...state, hasMore: state.nextCursor !== null, loadMore, refresh, retry }
}
