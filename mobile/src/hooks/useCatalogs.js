import { useCallback, useEffect, useState } from 'react'

import { getCatalogs } from '../services/api/catalogs.js'

// Los catálogos cambian poco y son iguales para todos: se piden una vez por sesión de la app y se reutilizan entre pantallas.
let cached = null
let inFlight = null

/** Solo para tests: descarta lo guardado. */
export function resetCatalogsCache () {
  cached = null
  inFlight = null
}

function loadCatalogs () {
  if (cached) return Promise.resolve(cached)
  inFlight ??= getCatalogs()
    .then((catalog) => { cached = catalog; return catalog })
    .finally(() => { inFlight = null })
  return inFlight
}

export const CATALOG_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', ERROR: 'error' })

/**
 * Catálogos para los selectores, con cargando / error / reintentar.
 * @returns {{ status: string, catalog: object | null, error: Error | null, retry: () => void }}
 */
export function useCatalogs () {
  const [state, setState] = useState(cached
    ? { status: CATALOG_STATUS.READY, catalog: cached, error: null }
    : { status: CATALOG_STATUS.LOADING, catalog: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cached) return undefined
    let active = true
    loadCatalogs().then(
      (catalog) => { if (active) setState({ status: CATALOG_STATUS.READY, catalog, error: null }) },
      (error) => { if (active) setState({ status: CATALOG_STATUS.ERROR, catalog: null, error }) }
    )
    return () => { active = false }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: CATALOG_STATUS.LOADING, catalog: null, error: null })
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
