import { useCallback, useRef, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { joinPlan, leavePlan } from '../services/api/participations.js'
import { updatePlan } from '../services/api/plans.js'
import { messageForError } from '../utils/errorMessages.js'

export const PLAN_ACTION = Object.freeze({ JOIN: 'join', LEAVE: 'leave', CLOSE: 'close', REOPEN: 'reopen', CANCEL: 'cancel' })

// Qué se le dice al usuario según el `code` (la app decide por `code`, nunca por `message`). Lo que no figura acá
// usa el texto general de `messageForError`.
const MESSAGES = Object.freeze({
  [PLAN_ACTION.JOIN]: {
    PLAN_FULL: 'El plan se llenó: ya no quedan lugares.',
    PLAN_CLOSED: 'Este plan ya no admite inscripciones.',
    ALREADY_JOINED: 'Ya estabas inscripto en este plan.',
    NOT_FOUND: 'Este plan ya no está disponible.'
  },
  [PLAN_ACTION.LEAVE]: {
    PLAN_CLOSED: 'Ya no podés darte de baja: el plan empezó, se canceló o ya registraste tu asistencia.',
    NOT_FOUND: 'Este plan ya no está disponible.'
  },
  [PLAN_ACTION.CLOSE]: { PLAN_CLOSED: 'Solo se pueden cerrar las inscripciones antes de que empiece el plan.' },
  [PLAN_ACTION.REOPEN]: { PLAN_CLOSED: 'Solo se pueden reabrir las inscripciones antes de que empiece el plan.' },
  [PLAN_ACTION.CANCEL]: { PLAN_CLOSED: 'El plan ya terminó o ya estaba cancelado.' }
})

/**
 * Acciones sobre un plan: inscribirse, darse de baja y (el creador) cerrar, reabrir o cancelar.
 * La pantalla NO cambia hasta que el servidor confirma: recién ahí se llama a `onChanged` para volver a pedir el plan.
 * Si el servidor rechaza, también se vuelve a pedir (el estado que mostraba la pantalla estaba viejo).
 * @param {string} planId
 * @param {{ onChanged: () => void }} options
 */
export function usePlanActions (planId, { onChanged }) {
  const [state, setState] = useState({ pending: null, error: null })
  // Evita dos pedidos a la vez aunque se toque dos veces antes del siguiente render.
  const busyRef = useRef(false)

  const run = useCallback(async (action, request) => {
    if (busyRef.current) return false
    busyRef.current = true
    setState({ pending: action, error: null })
    try {
      await request()
      setState({ pending: null, error: null })
      onChanged()
      return true
    } catch (failure) {
      const error = toApiError(failure)
      setState({ pending: null, error: { message: messageForError(error, MESSAGES[action]), requestId: error.requestId, code: error.code } })
      onChanged()
      return false
    } finally {
      busyRef.current = false
    }
  }, [onChanged])

  const join = useCallback(() => run(PLAN_ACTION.JOIN, () => joinPlan(planId)), [run, planId])
  const leave = useCallback(() => run(PLAN_ACTION.LEAVE, () => leavePlan(planId)), [run, planId])
  const closeSignUps = useCallback(() => run(PLAN_ACTION.CLOSE, () => updatePlan(planId, { status: 'closed' })), [run, planId])
  const reopenSignUps = useCallback(() => run(PLAN_ACTION.REOPEN, () => updatePlan(planId, { status: 'open' })), [run, planId])
  const cancel = useCallback(() => run(PLAN_ACTION.CANCEL, () => updatePlan(planId, { status: 'cancelled' })), [run, planId])

  return { ...state, isBusy: state.pending !== null, join, leave, closeSignUps, reopenSignUps, cancel }
}
