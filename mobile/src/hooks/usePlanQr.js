import { useCallback, useEffect, useState } from 'react'

import { createPlanQr } from '../services/api/checkins.js'
import { qrRefreshDelay } from '../utils/attendance.js'
import { toViewError } from '../utils/errorMessages.js'

export const QR_STATUS = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  /** El plan no admite QR ahora (fuera del horario de asistencia, cancelado o terminado): no se reintenta solo. */
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
})

const UNAVAILABLE_CODES = new Set(['CHECKIN_WINDOW_CLOSED', 'PLAN_CLOSED', 'FORBIDDEN', 'NOT_FOUND'])

const MESSAGES = Object.freeze({
  CHECKIN_WINDOW_CLOSED: 'El QR solo se puede mostrar durante el horario de asistencia del plan.',
  PLAN_CLOSED: 'El plan está cancelado o ya terminó.',
  FORBIDDEN: 'Solo quien organiza el plan puede mostrar el QR.',
  NOT_FOUND: 'Este plan ya no está disponible.'
})

const LOADING_STATE = Object.freeze({ status: QR_STATUS.LOADING, qrToken: null, expiresAt: null, error: null })

/**
 * QR de asistencia para la pantalla del creador. Pide uno al entrar y lo renueva solo un poco antes de que venza
 * (cada QR dura alrededor de un minuto y medio; al renovarlo, el anterior sigue valiendo unos segundos). Al salir de la pantalla deja de pedir.
 * @param {string} planId
 */
export function usePlanQr (planId) {
  const [state, setState] = useState(LOADING_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer = null

    // No rechaza nunca: toda falla termina en un estado que la pantalla sabe pintar.
    async function load () {
      try {
        const { qrToken, expiresAt } = await createPlanQr(planId, { signal: controller.signal })
        if (controller.signal.aborted) return
        setState({ status: QR_STATUS.READY, qrToken, expiresAt, error: null })
        timer = setTimeout(load, qrRefreshDelay(expiresAt))
      } catch (failure) {
        if (controller.signal.aborted) return
        const error = toViewError(failure, MESSAGES)
        setState({
          status: UNAVAILABLE_CODES.has(error.code) ? QR_STATUS.UNAVAILABLE : QR_STATUS.ERROR,
          qrToken: null,
          expiresAt: null,
          error
        })
      }
    }

    load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [planId, attempt])

  const retry = useCallback(() => {
    setState(LOADING_STATE)
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
