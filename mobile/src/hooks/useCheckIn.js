import { useCallback, useRef, useState } from 'react'

import { checkIn } from '../services/api/checkins.js'
import { toApiError } from '../services/api/client.js'
import { LOCATION_STATUS, getPreciseLocation } from '../services/location.js'
import { looksLikeQrToken } from '../utils/attendance.js'
import { messageForError } from '../utils/errorMessages.js'

export const CHECK_IN_STATUS = Object.freeze({
  IDLE: 'idle',
  /** Obteniendo la ubicación del teléfono. */
  LOCATING: 'locating',
  /** Esperando la respuesta del servidor. */
  SENDING: 'sending',
  DONE: 'done',
  ERROR: 'error'
})

/** Motivos de rechazo que detecta la app antes de llamar al servidor. */
export const CHECK_IN_LOCAL_ERRORS = Object.freeze({
  LOCATION_DENIED: 'LOCATION_DENIED',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE'
})

const QR_INVALID_MESSAGE = 'Ese código no sirve o ya venció. Pedile a quien organiza que te muestre el QR actual y escanealo de nuevo.'

// Un texto por `code`: cada rechazo se explica (S4-MOB-03). `OUT_OF_RANGE` usa el mensaje del servidor, que distingue
// "estás lejos" de "la señal de GPS es imprecisa".
const MESSAGES = Object.freeze({
  QR_INVALID: QR_INVALID_MESSAGE,
  // Un QR con una forma que el servidor ni siquiera acepta tampoco es un QR de asistencia.
  VALIDATION_ERROR: QR_INVALID_MESSAGE,
  CHECKIN_WINDOW_CLOSED: 'Fuera de horario: la asistencia se registra desde 15 minutos antes de que empiece el plan y por un tiempo limitado.',
  ALREADY_CHECKED_IN: 'Ya habías registrado tu asistencia a este plan.',
  PLAN_CLOSED: 'El plan está cancelado o ya terminó.',
  FORBIDDEN: 'Tenés que estar inscripto en el plan para registrar tu asistencia.',
  NOT_FOUND: 'Este plan ya no está disponible.',
  [CHECK_IN_LOCAL_ERRORS.LOCATION_DENIED]: 'Para registrar tu asistencia necesitamos tu ubicación. Dale permiso a junte desde los ajustes del teléfono y probá de nuevo.',
  [CHECK_IN_LOCAL_ERRORS.LOCATION_UNAVAILABLE]: 'No pudimos obtener tu ubicación. Activá el GPS, salí al aire libre y probá de nuevo.'
})

// Rechazos que no se arreglan volviendo a escanear.
const FINAL_CODES = new Set(['ALREADY_CHECKED_IN', 'PLAN_CLOSED', 'FORBIDDEN', 'NOT_FOUND', 'CHECKIN_WINDOW_CLOSED'])

const IDLE = Object.freeze({ status: CHECK_IN_STATUS.IDLE, result: null, error: null })

/** Estado de rechazo: por un `code` local, o por el error que devolvió el servidor. */
const rejected = (code, error) => ({
  status: CHECK_IN_STATUS.ERROR,
  result: null,
  error: { code, message: error ? messageForError(error, MESSAGES) : MESSAGES[code], requestId: error?.requestId, canRetry: !FINAL_CODES.has(code) }
})

/**
 * Registra la asistencia a un plan: toma la ubicación (con su precisión) y la manda junto con el QR leído.
 * No se encola si no hay conexión: depende del momento exacto. La ubicación no se guarda ni se loguea.
 * @param {string} planId
 */
export function useCheckIn (planId) {
  const [state, setState] = useState(IDLE)
  // Evita dos envíos a la vez: la cámara puede leer el mismo QR varias veces por segundo.
  const busyRef = useRef(false)

  /**
   * @param {{ qrToken?: string }} [params]  Sin `qrToken`: el creador inscripto, que no escanea su propio QR.
   * @returns {Promise<boolean>} true si la asistencia quedó registrada.
   */
  const submit = useCallback(async ({ qrToken } = {}) => {
    if (busyRef.current) return false
    busyRef.current = true
    const fail = (code, error) => {
      setState(rejected(code, error))
      return false
    }
    try {
      if (qrToken !== undefined && !looksLikeQrToken(qrToken)) return fail('QR_INVALID')

      setState({ status: CHECK_IN_STATUS.LOCATING, result: null, error: null })
      const location = await getPreciseLocation()
      if (location.status === LOCATION_STATUS.DENIED) return fail(CHECK_IN_LOCAL_ERRORS.LOCATION_DENIED)
      if (location.status !== LOCATION_STATUS.GRANTED) return fail(CHECK_IN_LOCAL_ERRORS.LOCATION_UNAVAILABLE)

      setState({ status: CHECK_IN_STATUS.SENDING, result: null, error: null })
      const { latitude, longitude, accuracyMeters } = location
      const result = await checkIn(planId, { ...(qrToken !== undefined ? { qrToken } : {}), latitude, longitude, accuracyMeters })
      setState({ status: CHECK_IN_STATUS.DONE, result, error: null })
      return true
    } catch (failure) {
      const error = toApiError(failure)
      return fail(error.code, error)
    } finally {
      busyRef.current = false
    }
  }, [planId])

  const reset = useCallback(() => setState(IDLE), [])

  return {
    ...state,
    isWorking: state.status === CHECK_IN_STATUS.LOCATING || state.status === CHECK_IN_STATUS.SENDING,
    submit,
    reset
  }
}
