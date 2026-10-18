import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { createPlanQr } from '../services/api/checkins.js'
import { QR_MIN_REFRESH_MS, isQrExpired, isQrRefreshDue, localQrExpiry, qrRefreshDelay } from '../utils/attendance.js'
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

const LOADING_STATE = Object.freeze({ status: QR_STATUS.LOADING, qrToken: null, expiresAt: null, error: null, refreshError: null })

const time = (iso) => new Date(iso).getTime()

/**
 * QR de asistencia para la pantalla del creador. Pide uno al entrar y lo renueva solo un poco antes de que venza
 * (cada QR dura alrededor de un minuto y medio; al renovarlo, el anterior sigue valiendo unos segundos). Al salir de
 * la pantalla deja de pedir.
 *
 * Si una renovación falla por red o por el servidor y el QR que se ve todavía vale, se sigue mostrando (`READY` con
 * `refreshError`) y se reintenta cada `QR_MIN_REFRESH_MS`; recién cuando vence pasa a `ERROR`. Si el plan ya no
 * admite QR (`UNAVAILABLE_CODES`) se oculta enseguida.
 *
 * Al volver de segundo plano los timers estuvieron pausados: si el QR ya venció se oculta y se pide otro; si sigue
 * valiendo pero ya tocaba renovarlo, se renueva sin ocultarlo.
 *
 * `expiresAt` está en el reloj del teléfono (ver `localQrExpiry`): sirve tal cual para mostrar "vale hasta las HH:MM".
 * @param {string} planId
 */
export function usePlanQr (planId) {
  const [state, setState] = useState(LOADING_STATE)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let refreshTimer = null
    let expiryTimer = null
    // Vencimiento del QR que se está mostrando (null si no se muestra ninguno).
    let shownExpiresAt = null
    // Por qué falló la última renovación (null si no falló o todavía no se intentó).
    let lastRefreshError = null
    let isRequesting = false
    // Cuándo empezó el último pedido: nunca se pide otro antes de `QR_MIN_REFRESH_MS`.
    let lastRequestAt = 0

    function hide (next) {
      clearTimeout(refreshTimer)
      clearTimeout(expiryTimer)
      shownExpiresAt = null
      setState(next)
    }

    // El QR que se ve venció sin que llegara el próximo: si ya falló una renovación, error con "Reintentar"; si no,
    // se deja de mostrar y se espera el próximo, que ya está en camino o programado (un QR con menos vida que
    // `QR_MIN_REFRESH_MS` vence antes de su renovación): ese timer no se cancela.
    function expire () {
      shownExpiresAt = null
      if (lastRefreshError) {
        clearTimeout(refreshTimer)
        setState({ ...LOADING_STATE, status: QR_STATUS.ERROR, error: lastRefreshError })
      } else {
        setState(LOADING_STATE)
      }
    }

    // No rechaza nunca: toda falla termina en un estado que la pantalla sabe pintar.
    async function load () {
      clearTimeout(refreshTimer)
      isRequesting = true
      lastRequestAt = Date.now()
      try {
        const response = await createPlanQr(planId, { signal: controller.signal })
        if (controller.signal.aborted) return
        // De acá en adelante todo se compara con el reloj del teléfono: el vencimiento se pasa a ese reloj.
        const { qrToken } = response
        const expiresAt = localQrExpiry(response.expiresAt, response.serverDate)
        clearTimeout(expiryTimer)
        shownExpiresAt = expiresAt
        lastRefreshError = null
        setState({ status: QR_STATUS.READY, qrToken, expiresAt, error: null, refreshError: null })
        refreshTimer = setTimeout(load, qrRefreshDelay(expiresAt))
        expiryTimer = setTimeout(expire, Math.max(0, time(expiresAt) - Date.now()))
      } catch (failure) {
        if (controller.signal.aborted) return
        const error = toViewError(failure, MESSAGES)
        if (UNAVAILABLE_CODES.has(error.code)) {
          hide({ ...LOADING_STATE, status: QR_STATUS.UNAVAILABLE, error })
        } else if (shownExpiresAt && !isQrExpired(shownExpiresAt)) {
          lastRefreshError = error
          setState((current) => ({ ...current, refreshError: error }))
          refreshTimer = setTimeout(load, QR_MIN_REFRESH_MS)
        } else {
          hide({ ...LOADING_STATE, status: QR_STATUS.ERROR, error })
        }
      } finally {
        isRequesting = false
      }
    }

    load()
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !shownExpiresAt || isRequesting) return
      if (isQrExpired(shownExpiresAt)) hide(LOADING_STATE)
      else if (!isQrRefreshDue(shownExpiresAt)) return
      // Si recién se pidió uno (p. ej. un reintento que falló), se espera lo que falta del mínimo.
      const wait = lastRequestAt + QR_MIN_REFRESH_MS - Date.now()
      if (wait <= 0) {
        load()
      } else {
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(load, wait)
      }
    })
    return () => {
      controller.abort()
      clearTimeout(refreshTimer)
      clearTimeout(expiryTimer)
      subscription.remove()
    }
  }, [planId, attempt])

  const retry = useCallback(() => {
    setState(LOADING_STATE)
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}
