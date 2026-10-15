import { useCallback, useEffect, useRef, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { getFeed } from '../services/api/feed.js'
import { listPlans } from '../services/api/plans.js'
import { readBusySlots } from '../services/calendar.js'
import { LOCATION_STATUS, getCurrentCoordinates } from '../services/location.js'
import { connectivity, isTransportFailure, readCache } from '../services/offline/index.js'
import { toApiFilters } from './useFeedFilters.js'

export const FEED_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', ERROR: 'error' })

/** Cómo quedó ordenado el feed: por recomendación cerca del usuario, o por fecha si no hay ubicación. */
export const FEED_MODE = Object.freeze({ NEARBY: 'nearby', BY_DATE: 'byDate' })

const PAGE_SIZE = 20

const INITIAL = Object.freeze({
  status: FEED_STATUS.LOADING,
  items: [],
  nextCursor: null,
  error: null,
  mode: null,
  locationStatus: null,
  isRefreshing: false,
  isLoadingMore: false,
  loadMoreError: null,
  savedAt: null
})

/**
 * Feed de planes con scroll infinito (por `nextCursor`) y pull-to-refresh.
 *
 * Primera página: pide la ubicación; si la hay, lee las franjas ocupadas del calendario (si hay permiso) y consulta
 * POST /feed (cerca y por recomendación). Sin ubicación degrada a GET /plans (por fecha). Las páginas siguientes
 * repiten exactamente la misma consulta con el cursor (el back rechaza un cursor de otra búsqueda).
 * Sin conexión muestra la última primera página guardada con los mismos filtros (`savedAt`, sin "cargar más"). Solo se
 * guardan los planes que ya mostraba la pantalla: ni la posición ni el calendario.
 * @param {{ query: object, radiusKm: number }} params  De `useFeedFilters`.
 */
export function useFeed ({ query, radiusKm }) {
  const [state, setState] = useState(INITIAL)
  // Consulta de la primera página: las siguientes la reutilizan tal cual.
  const requestRef = useRef(null)
  // Cada carga nueva invalida las respuestas de las anteriores (filtros que cambian, refrescos, desmontaje).
  const generationRef = useRef(0)
  // `loadMore` lee el estado más reciente sin recrearse en cada render (FlatList lo llama desde onEndReached).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const filtersKey = JSON.stringify(query)

  const loadFirstPage = useCallback(async ({ isRefreshing = false } = {}) => {
    const generation = ++generationRef.current
    const isCurrent = () => generation === generationRef.current
    const cacheKey = `feed:${radiusKm}:${filtersKey}`
    setState((current) => (isRefreshing
      ? { ...current, isRefreshing: true, loadMoreError: null }
      : { ...INITIAL }))

    /** La última primera página guardada con estos filtros, o null. */
    async function showCached () {
      const cached = await readCache.load(cacheKey)
      if (!cached || !isCurrent()) return Boolean(cached)
      const { items, mode, locationStatus } = cached.data
      requestRef.current = null
      setState({ ...INITIAL, status: FEED_STATUS.READY, items, mode, locationStatus, savedAt: cached.savedAt })
      return true
    }

    if (!isRefreshing && !connectivity.isOnline() && await showCached()) return

    try {
      const filters = toApiFilters(JSON.parse(filtersKey))
      const location = await getCurrentCoordinates()
      if (!isCurrent()) return

      let request
      if (location.status === LOCATION_STATUS.GRANTED) {
        const calendar = await readBusySlots()
        if (!isCurrent()) return
        const body = { ...filters, near: location.coordinates, radiusKm, limit: PAGE_SIZE, ...(calendar ? { calendar } : {}) }
        request = { mode: FEED_MODE.NEARBY, fetchPage: (cursor) => getFeed({ ...body, ...(cursor ? { cursor } : {}) }) }
      } else {
        const params = { ...filters, limit: PAGE_SIZE }
        request = { mode: FEED_MODE.BY_DATE, fetchPage: (cursor) => listPlans({ ...params, ...(cursor ? { cursor } : {}) }) }
      }

      const page = await request.fetchPage(null)
      if (!isCurrent()) return
      requestRef.current = request
      setState({ ...INITIAL, status: FEED_STATUS.READY, items: page.items, nextCursor: page.nextCursor, mode: request.mode, locationStatus: location.status })
      readCache.save(cacheKey, { items: page.items, mode: request.mode, locationStatus: location.status })
    } catch (failure) {
      if (!isCurrent()) return
      const error = toApiError(failure)
      // Un refresco que falla conserva lo que ya se veía (abajo); solo la primera carga recurre a lo guardado.
      if (!isRefreshing && isTransportFailure(error) && await showCached()) return
      if (!isCurrent()) return
      // Si falla un refresco se conserva lo que ya se veía; si falla la primera carga, pantalla de error.
      setState((current) => (isRefreshing && current.status === FEED_STATUS.READY
        ? { ...current, isRefreshing: false, loadMoreError: error }
        : { ...INITIAL, status: FEED_STATUS.ERROR, error }))
    }
  }, [filtersKey, radiusKm])

  useEffect(() => {
    loadFirstPage()
    // Al desmontar (o al cambiar los filtros) se descartan las respuestas que sigan en vuelo.
    const generations = generationRef
    return () => { generations.current++ }
  }, [loadFirstPage])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    const request = requestRef.current
    if (current.status !== FEED_STATUS.READY || !current.nextCursor || current.isLoadingMore || current.isRefreshing || !request) return

    const generation = generationRef.current
    setState((previous) => ({ ...previous, isLoadingMore: true, loadMoreError: null }))
    try {
      const page = await request.fetchPage(current.nextCursor)
      if (generation !== generationRef.current) return
      setState((previous) => {
        // Por las dudas: nunca dos tarjetas con el mismo plan.
        const known = new Set(previous.items.map((plan) => plan.id))
        const fresh = page.items.filter((plan) => !known.has(plan.id))
        return { ...previous, items: [...previous.items, ...fresh], nextCursor: page.nextCursor, isLoadingMore: false }
      })
    } catch (failure) {
      if (generation !== generationRef.current) return
      setState((previous) => ({ ...previous, isLoadingMore: false, loadMoreError: toApiError(failure) }))
    }
  }, [])

  const refresh = useCallback(() => loadFirstPage({ isRefreshing: true }), [loadFirstPage])
  const retry = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { ...state, hasMore: state.nextCursor !== null, loadMore, refresh, retry }
}
