import { useCallback, useEffect, useMemo, useState } from 'react'

import { getPlanFilters } from '../services/api/plans.js'
import { visibleInterestCategories } from '../utils/catalog.js'
import { AVAILABILITY, DEFAULT_RADIUS_KM, dateRangeFor } from '../utils/plans.js'
import { useAuth } from './useAuth.js'
import { useCatalogs } from './useCatalogs.js'

// Los rangos de precio los define el back (GET /plans/filters): se piden una vez por sesión de la app.
let cachedOptions = null
let inFlight = null

/** Solo para tests: descarta lo guardado. */
export function resetFilterOptionsCache () {
  cachedOptions = null
  inFlight = null
}

function loadOptions () {
  if (cachedOptions) return Promise.resolve(cachedOptions)
  inFlight ??= getPlanFilters()
    .then((options) => { cachedOptions = options; return options })
    .finally(() => { inFlight = null })
  return inFlight
}

const INITIAL = Object.freeze({
  availability: AVAILABILITY.AVAILABLE,
  radiusKm: DEFAULT_RADIUS_KM,
  datePreset: 'any',
  interests: [],
  priceRanges: []
})

const toggleIn = (list, key) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key])

/**
 * Filtros del feed. Son predefinidos: la app solo elige valores y el back arma la consulta.
 * `query` es lo que se manda a la API (sin el radio, que solo aplica cuando hay ubicación).
 */
export function useFeedFilters () {
  const [values, setValues] = useState(INITIAL)
  const [priceRanges, setPriceRanges] = useState(cachedOptions?.priceRanges ?? [])
  const { user } = useAuth()
  const { catalog } = useCatalogs()
  // Tipos de actividad del catálogo (los que tienen edad mínima solo se le muestran a quien la tiene).
  const interestCategories = useMemo(() => visibleInterestCategories(catalog, user?.age ?? null), [catalog, user?.age])

  useEffect(() => {
    let active = true
    // Si falla, el filtro de precio simplemente no se ofrece: el feed funciona igual.
    loadOptions().then((options) => { if (active) setPriceRanges(options.priceRanges ?? []) }, () => {})
    return () => { active = false }
  }, [])

  const setValue = useCallback((field, value) => setValues((current) => ({ ...current, [field]: value })), [])
  const toggleInterest = useCallback((key) => setValues((current) => ({ ...current, interests: toggleIn(current.interests, key) })), [])
  const togglePriceRange = useCallback((key) => setValues((current) => ({ ...current, priceRanges: toggleIn(current.priceRanges, key) })), [])
  // "Con cupo / Llenos" es una sección del feed, no un filtro del panel: limpiar no la cambia.
  const reset = useCallback(() => setValues((current) => ({ ...INITIAL, availability: current.availability })), [])

  const query = useMemo(() => ({
    availability: values.availability,
    ...(values.interests.length > 0 ? { interests: values.interests } : {}),
    ...(values.priceRanges.length > 0 ? { priceRanges: values.priceRanges } : {}),
    datePreset: values.datePreset
  }), [values.availability, values.interests, values.priceRanges, values.datePreset])

  const activeCount = (values.datePreset !== 'any' ? 1 : 0) + (values.interests.length > 0 ? 1 : 0) +
    (values.priceRanges.length > 0 ? 1 : 0) + (values.radiusKm !== DEFAULT_RADIUS_KM ? 1 : 0)

  return { values, query, radiusKm: values.radiusKm, priceRangeOptions: priceRanges, interestCategories, activeCount, setValue, toggleInterest, togglePriceRange, reset }
}

/**
 * Parámetros de la API a partir de `query`: el filtro de fecha predefinido se convierte en `to` al momento de pedir.
 * @param {ReturnType<typeof useFeedFilters>['query']} query
 * @param {Date} [now]
 */
export function toApiFilters ({ datePreset, ...rest }, now = new Date()) {
  return { ...rest, ...dateRangeFor(datePreset, now) }
}
