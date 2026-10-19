import { useCallback, useEffect, useState } from 'react'

import { getPlan } from '../services/api/plans.js'
import { toViewError } from '../utils/errorMessages.js'

/** Estados que pinta la pantalla: cargando, con datos, no disponible (404) o error. */
export const PLAN_STATUS = Object.freeze({ LOADING: 'loading', READY: 'ready', NOT_FOUND: 'notFound', ERROR: 'error' })

const LOADING_STATE = Object.freeze({ status: PLAN_STATUS.LOADING, plan: null, error: null, refreshError: null })

/**
 * Detalle de un plan. Vuelve a pedirlo con `reload` o cuando cambia `version` (p. ej. al volver de editarlo).
 * `refresh` lo pide otra vez SIN pasar por "cargando": la pantalla sigue mostrando el plan hasta que llega el nuevo
 * (después de inscribirse o darse de baja, cuando el servidor ya confirmó). Si ese refresco falla, el plan sigue a la
 * vista y el error queda en `refreshError` (como en el feed); solo un 404 lo reemplaza (el plan ya no está disponible).
 * @param {string} planId
 * @param {number} [version]
 * @returns {{ status: string, plan: object | null, error: import('../utils/errorMessages.js').ViewError | null,
 *   refreshError: import('../utils/errorMessages.js').ViewError | null, reload: () => void, refresh: () => void }}
 */
export function usePlan (planId, version = 0) {
  const [state, setState] = useState(LOADING_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    // No rechaza nunca: toda falla termina en un estado que la pantalla sabe pintar.
    async function load () {
      try {
        const plan = await getPlan(planId, { signal: controller.signal })
        if (controller.signal.aborted) return
        setState({ status: PLAN_STATUS.READY, plan, error: null, refreshError: null })
      } catch (failure) {
        if (controller.signal.aborted) return
        const error = toViewError(failure)
        const isNotFound = error.code === 'NOT_FOUND'
        setState((current) => {
          // Falló un refresco con el plan a la vista (p. ej. sin red al volver del chat): se conserva y se avisa.
          if (!isNotFound && current.status === PLAN_STATUS.READY && current.plan?.id === planId) return { ...current, refreshError: error }
          // 404: no existe o ya no es visible para este usuario (cancelado, terminado).
          return { status: isNotFound ? PLAN_STATUS.NOT_FOUND : PLAN_STATUS.ERROR, plan: null, error, refreshError: null }
        })
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
