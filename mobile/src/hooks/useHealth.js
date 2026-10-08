import { useCallback, useEffect, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { getHealth } from '../services/api/health.js'

/** Estados que pinta la pantalla: cargando, ok, degradado (503) o error. */
export const HEALTH_VIEW_STATUS = Object.freeze({
  LOADING: 'loading',
  OK: 'ok',
  DEGRADED: 'degraded',
  ERROR: 'error'
})

const LOADING_STATE = Object.freeze({ status: HEALTH_VIEW_STATUS.LOADING, requestId: null, error: null })

/**
 * Consulta el health de la API al montar y cada vez que se llama a `retry`.
 * @returns {{ status: string, requestId: string | null, error: import('../services/api/errors.js').ApiError | null, retry: () => void }}
 */
export function useHealth () {
  const [state, setState] = useState(LOADING_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    // No rechaza nunca: toda falla termina en el estado de error.
    async function load () {
      try {
        const result = await getHealth({ signal: controller.signal })
        if (controller.signal.aborted) return
        setState({ status: result.status, requestId: result.requestId, error: result.error ?? null })
      } catch (error) {
        // Si se abortó (desmontaje o reintento), el resultado ya no le importa a nadie.
        if (controller.signal.aborted) return
        const apiError = toApiError(error)
        setState({ status: HEALTH_VIEW_STATUS.ERROR, requestId: apiError.requestId, error: apiError })
      }
    }

    load()
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setState(LOADING_STATE)
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
