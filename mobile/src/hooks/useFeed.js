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

// Con el panel abierto cada toque cambia un filtro: la consulta sale recién cuando pasa este tiempo sin cambios, así
// cuatro toques seguidos son una sola request. Cambiar de sección ("Con cupo" / "Llenos") es un solo toque y va enseguida.
export const FILTERS_DEBOUNCE_MS = 400

const INITIAL = Object.freeze({
  status: FEED_STATUS.LOADING,
  items: [],
  nextCursor: null,
  error: null,
  mode: null,
  locationStatus: null,
  locationNotice: null,
  isRefreshing: false,
  // Recargando por un cambio de filtros con planes en pantalla: la lista sigue a la vista hasta que llega la respuesta.
  isReloading: false,
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
 * Al cambiar un filtro se espera `FILTERS_DEBOUNCE_MS` sin cambios, se reutilizan la ubicación y el calendario de la
 * consulta anterior (hasta `CONTEXT_TTL_MS`) y los planes que se veían quedan en pantalla (`isReloading`) hasta que
 * llega la respuesta. Una carga nueva cancela la request de la anterior.
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
  // Request en vuelo de la carga actual (primera página y siguientes): se cancela al empezar otra o al desmontar.
  const abortRef = useRef(null)
  // Guarda sincrónica de "cargar más": `stateRef` se actualiza recién después del commit, y dos `onEndReached`
  // seguidos antes de eso harían dos requests con el mismo cursor.
  const isLoadingMoreRef = useRef(false)

  const filtersKey = JSON.stringify(query)
  const availability = query.availability
  // Filtros que ya se aplicaron a la consulta (los de `query` y `radiusKm`, después de la espera).
  const [applied, setApplied] = useState({ filtersKey, radiusKm, availability })
  useEffect(() => {
    if (applied.filtersKey === filtersKey && applied.radiusKm === radiusKm) return undefined
    const delay = applied.availability === availability ? FILTERS_DEBOUNCE_MS : 0
    const timer = setTimeout(() => setApplied({ filtersKey, radiusKm, availability }), delay)
    return () => clearTimeout(timer)
  }, [filtersKey, radiusKm, availability, applied])

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

  const loadFirstPage = useCallback(async ({ isRefreshing = false, reuseContext = false, keepItems = false } = {}) => {
    const generation = ++generationRef.current
    const isCurrent = () => generation === generationRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    isLoadingMoreRef.current = false
    setState((current) => {
      if (isRefreshing) return { ...current, isRefreshing: true, isReloading: false, refreshError: null, loadMoreError: null }
      // Sin desmontar la lista (ni perder el scroll): se reemplaza cuando llega la respuesta.
      if (keepItems && current.status === FEED_STATUS.READY) {
        return { ...current, isReloading: true, isLoadingMore: false, refreshError: null, loadMoreError: null }
      }
      return { ...INITIAL }
    })

    try {
      const filters = toApiFilters(JSON.parse(applied.filtersKey))
      const context = await readContext({ reuse: reuseContext, isCurrent })
      if (!context) return
      const { location, calendar } = context

      let request
      if (location.status === LOCATION_STATUS.GRANTED) {
        const body = { ...filters, near: location.coordinates, radiusKm: applied.radiusKm, limit: PAGE_SIZE, ...(calendar ? { calendar } : {}) }
        request = { mode: FEED_MODE.NEARBY, fetchPage: (cursor, signal) => getFeed({ ...body, ...(cursor ? { cursor } : {}) }, { signal }) }
      } else {
        const params = { ...filters, limit: PAGE_SIZE }
        request = { mode: FEED_MODE.BY_DATE, fetchPage: (cursor, signal) => listPlans({ ...params, ...(cursor ? { cursor } : {}) }, { signal }) }
      }

      const page = await request.fetchPage(null, controller.signal)
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
  }, [applied.filtersKey, applied.radiusKm, readContext])

  useEffect(() => {
    // Primera carga o cambio de filtros: si hay una ubicación reciente, se reutiliza.
    loadFirstPage({ reuseContext: true, keepItems: true })
    // Al desmontar (o al cambiar los filtros) se descartan las respuestas que sigan en vuelo y se cancela la request.
    const generations = generationRef
    const requests = abortRef
    return () => {
      generations.current++
      requests.current?.abort()
    }
  }, [loadFirstPage])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    const request = requestRef.current
    if (current.status !== FEED_STATUS.READY || !current.nextCursor || current.isRefreshing || current.isReloading || !request) return
    if (isLoadingMoreRef.current) return

    const generation = generationRef.current
    isLoadingMoreRef.current = true
    setState((previous) => ({ ...previous, isLoadingMore: true, loadMoreError: null }))
    try {
      const page = await request.fetchPage(current.nextCursor, abortRef.current?.signal)
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
    } finally {
      if (generation === generationRef.current) isLoadingMoreRef.current = false
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
