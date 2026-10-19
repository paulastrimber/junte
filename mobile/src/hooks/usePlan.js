import { useCallback, useEffect, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { getPlan } from '../services/api/plans.js'
import { connectivity, readCache, readThrough } from '../services/offline/index.js'

/** Estados que pinta la pantalla: cargando, con datos, no disponible (404) o error. */
export const PLAN_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', NOT_FOUND: 'notFound', ERROR: 'error' })

const LOADING_STATE = Object.freeze({ status: PLAN_STATUS.LOADING, plan: null, error: null, savedAt: null })

/**
 * Detalle de un plan. Vuelve a pedirlo con `reload` o cuando cambia `version` (p. ej. al volver de editarlo).
 * `refresh` lo pide otra vez SIN pasar por "cargando": la pantalla sigue mostrando el plan hasta que llega el nuevo
 * (después de inscribirse o darse de baja, cuando el servidor ya confirmó).
 * Sin conexión muestra la última versión guardada en el teléfono, con `savedAt` (S6-MOB-01).
 * @param {string} planId
 * @param {number} [version]
 * @returns {{ status: string, plan: object | null, error: import('../services/api/errors.js').ApiError | null, savedAt: string | null, reload: () => void, refresh: () => void }}
 */
export function usePlan (planId, version = 0) {
  const [state, setState] = useState(LOADING_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    // No rechaza nunca: toda falla termina en un estado que la pantalla sabe pintar.
    async function load () {
      try {
        const { data: plan, savedAt } = await readThrough({
          key: `plan:${planId}`,
          fetch: () => getPlan(planId, { signal: controller.signal }),
          cache: readCache,
          connectivity
        })
        if (controller.signal.aborted) return
        setState({ status: PLAN_STATUS.READY, plan, error: null, savedAt })
      } catch (failure) {
        if (controller.signal.aborted) return
        const error = toApiError(failure)
        // 404: no existe o ya no es visible para este usuario (cancelado, terminado).
        setState({ status: error.code === 'NOT_FOUND' ? PLAN_STATUS.NOT_FOUND : PLAN_STATUS.ERROR, plan: null, error, savedAt: null })
      }
    }

    load()
    return () => controller.abort()
  }, [planId, version, attempt])

  const reload = useCallback(() => {
    setState(LOADING_STATE)
    setAttempt((value) => value + 1)
  }, [])

  const refresh = useCallback(() => setAttempt((value) => value + 1), [])

  return { ...state, reload, refresh }
}
