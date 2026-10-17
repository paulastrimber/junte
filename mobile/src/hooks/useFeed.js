import { useCallback, useEffect, useRef, useState } from 'react'

import { getFeed } from '../services/api/feed.js'
import { listPlans } from '../services/api/plans.js'
import { readBusySlots } from '../services/calendar.js'
import { LOCATION_STATUS, getCurrentCoordinates } from '../services/location.js'
import { toViewError } from '../utils/errorMessages.js'
import { toApiFilters } from './useFeedFilters.js'

export const FEED_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', ERROR: 'error' })

/** Cómo quedó ordenado el feed: por recomendación cerca del usuario, o por fecha si no hay ubicación. */
export const FEED_MODE = Object.freeze({ NEARBY: 'nearby', BY_DATE: 'byDate' })

/** Por qué el feed quedó por fecha: sin permiso de ubicación, o con permiso pero sin poder obtenerla. */
export const LOCATION_NOTICE = Object.freeze({ DENIED: 'denied', UNAVAILABLE: 'unavailable' })

const PAGE_SIZE = 20

// Mientras se tocan filtros se reutilizan la ubicación y las franjas del calendario de la última consulta: cada toque
// no vuelve a pedir el GPS ni a leer el calendario. Un pull-to-refresh o un "Reintentar" las pide de nuevo.
export const CONTEXT_TTL_MS = 60_000

const INITIAL = Object.freeze({
  status: FEED_STATUS.LOADING,
  items: [],
  nextCursor: null,
  error: null,
  mode: null,
  locationStatus: null,
  locationNotice: null,
  isRefreshing: false,
  refreshError: null,
  isLoadingMore: false,
  loadMoreError: null
})

/**
 * Feed de planes con scroll infinito (por `nextCursor`) y pull-to-refresh.
 *
 * Primera página: pide la ubicación; si la hay, lee las franjas ocupadas del calendario (si hay permiso) y consulta
 * POST /feed (cerca y por recomendación). Sin ubicación degrada a GET /plans (por fecha). Las páginas siguientes
 * repiten exactamente la misma consulta con el cursor (el back rechaza un cursor de otra búsqueda).
 * Al cambiar un filtro se reutilizan la ubicación y el calendario de la consulta anterior (hasta `CONTEXT_TTL_MS`).
 * Errores (`ViewError`): `error` si falló la primera carga, `refreshError` si falló un refresco (se conservan los
 * planes) y `loadMoreError` si falló una página siguiente. `locationNotice` dice por qué quedó por fecha.
 * @param {{ query: object, radiusKm: number }} params  De `useFeedFilters`.
 */
export function useFeed ({ query, radiusKm }) {
  const [state, setState] = useState(INITIAL)
  // Consulta de la primera página: las siguientes la reutilizan tal cual.
  const requestRef = useRef(null)
  // Cada carga nueva invalida las respuestas de las anteriores (filtros que cambian, refrescos, desmontaje).
  const generationRef = useRef(0)
  // Ubicación y franjas ocupadas de la última consulta, con el momento en que se obtuvieron.
  const contextRef = useRef(null)
  // `loadMore` lee el estado más reciente sin recrearse en cada render (FlatList lo llama desde onEndReached).
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const filtersKey = JSON.stringify(query)

  // Ubicación y calendario: los de la consulta anterior si son recientes y se permite, o recién pedidos.
  const readContext = useCallback(async ({ reuse, isCurrent }) => {
    const cached = contextRef.current
    if (reuse && cached && Date.now() - cached.at < CONTEXT_TTL_MS) return cached
    const location = await getCurrentCoordinates()
    if (!isCurrent()) return null
    const calendar = location.status === LOCATION_STATUS.GRANTED ? await readBusySlots() : null
    if (!isCurrent()) return null
    contextRef.current = { at: Date.now(), location, calendar }
    return contextRef.current
  }, [])

  const loadFirstPage = useCallback(async ({ isRefreshing = false, reuseContext = false } = {}) => {
    const generation = ++generationRef.current
    const isCurrent = () => generation === generationRef.current
    setState((current) => (isRefreshing
      ? { ...current, isRefreshing: true, refreshError: null, loadMoreError: null }
      : { ...INITIAL }))

    try {
      const filters = toApiFilters(JSON.parse(filtersKey))
      const context = await readContext({ reuse: reuseContext, isCurrent })
      if (!context) return
      const { location, calendar } = context

      let request
      if (location.status === LOCATION_STATUS.GRANTED) {
        const body = { ...filters, near: location.coordinates, radiusKm, limit: PAGE_SIZE, ...(calendar ? { calendar } : {}) }
        request = { mode: FEED_MODE.NEARBY, fetchPage: (cursor) => getFeed({ ...body, ...(cursor ? { cursor } : {}) }) }
      } else {
        const params = { ...filters, limit: PAGE_SIZE }
        request = { mode: FEED_MODE.BY_DATE, fetchPage: (cursor) => listPlans({ ...params, ...(cursor ? { cursor } : {}) }) }
      }

      const page = await request.fetchPage(null)
      if (!isCurrent()) return
      requestRef.current = request
      setState({
        ...INITIAL,
        status: FEED_STATUS.READY,
        items: page.items,
        nextCursor: page.nextCursor,
        mode: request.mode,
        locationStatus: location.status,
        locationNotice: noticeFor(location.status)
      })
    } catch (failure) {
      if (!isCurrent()) return
      const error = toViewError(failure)
      // Si falla un refresco se conserva lo que ya se veía; si falla la primera carga, pantalla de error.
      setState((current) => (isRefreshing && current.status === FEED_STATUS.READY
        ? { ...current, isRefreshing: false, refreshError: error }
        : { ...INITIAL, status: FEED_STATUS.ERROR, error }))
    }
  }, [filtersKey, radiusKm, readContext])

  useEffect(() => {
    // Primera carga o cambio de filtros: si hay una ubicación reciente, se reutiliza.
    loadFirstPage({ reuseContext: true })
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
      setState((previous) => ({ ...previous, isLoadingMore: false, loadMoreError: toViewError(failure) }))
    }
  }, [])

  const refresh = useCallback(() => loadFirstPage({ isRefreshing: true }), [loadFirstPage])
  const retry = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { ...state, hasMore: state.nextCursor !== null, loadMore, refresh, retry }
}

function noticeFor (locationStatus) {
  if (locationStatus === LOCATION_STATUS.GRANTED) return null
  return locationStatus === LOCATION_STATUS.DENIED ? LOCATION_NOTICE.DENIED : LOCATION_NOTICE.UNAVAILABLE
}
