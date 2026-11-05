import { useCallback, useEffect, useRef, useState } from 'react'

import { cancelSpotAlert, joinPlan, leavePlan, requestSpotAlert } from '../services/api/participations.js'
import { updatePlan } from '../services/api/plans.js'
import { OUTBOX_STATUS, OUTBOX_TYPE, connectivity, isTransportFailure, outbox } from '../services/offline/index.js'
import { toViewError } from '../utils/errorMessages.js'
import { useOutbox } from './useOffline.js'

export const PLAN_ACTION = Object.freeze({
  JOIN: 'join', LEAVE: 'leave', CLOSE: 'close', REOPEN: 'reopen', CANCEL: 'cancel', SPOT_ALERT: 'spotAlert', CANCEL_SPOT_ALERT: 'cancelSpotAlert'
})

// Qué se le dice al usuario según el `code` (la app decide por `code`, nunca por `message`). Lo que no figura acá
// usa el texto general (`toViewError`).
export const PLAN_ACTION_MESSAGES = Object.freeze({
  [PLAN_ACTION.JOIN]: {
    PLAN_FULL: 'El plan se llenó: ya no quedan lugares.',
    PLAN_CLOSED: 'Este plan ya no admite inscripciones.',
    ALREADY_JOINED: 'Ya tenías tu lugar en este plan.',
    NOT_FOUND: 'Este plan ya no está disponible.'
  },
  [PLAN_ACTION.LEAVE]: {
    PLAN_CLOSED: 'Ya no podés darte de baja: el plan empezó, se canceló o ya registraste tu asistencia.',
    NOT_FOUND: 'Este plan ya no está disponible.'
  },
  [PLAN_ACTION.CLOSE]: { PLAN_CLOSED: 'Solo se pueden cerrar las inscripciones antes de que empiece el plan.' },
  [PLAN_ACTION.REOPEN]: { PLAN_CLOSED: 'Solo se pueden reabrir las inscripciones antes de que empiece el plan.' },
  [PLAN_ACTION.CANCEL]: { PLAN_CLOSED: 'El plan ya terminó o ya estaba cancelado.' },
  [PLAN_ACTION.SPOT_ALERT]: {
    PLAN_NOT_FULL: 'Se liberó un lugar: ya podés inscribirte.',
    PLAN_CLOSED: 'Este plan ya no admite inscripciones.',
    ALREADY_JOINED: 'Ya tenés tu lugar en este plan.',
    NOT_FOUND: 'Este plan ya no está disponible.'
  },
  [PLAN_ACTION.CANCEL_SPOT_ALERT]: {}
})

const QUEUEABLE = Object.freeze({ [PLAN_ACTION.JOIN]: OUTBOX_TYPE.JOIN, [PLAN_ACTION.LEAVE]: OUTBOX_TYPE.LEAVE })

/**
 * Acciones sobre un plan: inscribirse, darse de baja y (el creador) cerrar, reabrir o cancelar.
 * La pantalla NO cambia hasta que el servidor confirma: recién ahí se llama a `onChanged` para volver a pedir el plan.
 * Si el servidor rechaza, también se vuelve a pedir (el estado que mostraba la pantalla estaba viejo).
 * Sin conexión, inscribirse y darse de baja quedan en la cola de pendientes (S6-MOB-02): `queued` dice qué espera y
 * cuando el servidor contesta se vuelve a pedir el plan; si lo rechaza (p. ej. el plan se llenó), queda el motivo.
 * @param {string} planId
 * @param {{ onChanged: () => void, planTitle?: string | null }} options
 */
export function usePlanActions (planId, { onChanged, planTitle = null }) {
  const [state, setState] = useState({ pending: null, error: null })
  // Evita dos pedidos a la vez aunque se toque dos veces antes del siguiente render.
  const busyRef = useRef(false)

  const ofThisPlan = useCallback((item) => item.payload.planId === planId && (item.type === OUTBOX_TYPE.JOIN || item.type === OUTBOX_TYPE.LEAVE), [planId])
  const { items: queuedItems } = useOutbox(ofThisPlan)

  // Cuando la cola manda (o el servidor rechaza) algo de este plan, la pantalla vuelve a pedirlo.
  useEffect(() => outbox.onSettled((item) => { if (ofThisPlan(item)) onChanged() }), [ofThisPlan, onChanged])

  const run = useCallback(async (action, request) => {
    if (busyRef.current) return false
    busyRef.current = true
    setState({ pending: action, error: null })
    const enqueue = async () => {
      await outbox.enqueue(QUEUEABLE[action], { planId, planTitle })
      setState({ pending: null, error: null })
      return 'queued'
    }
    try {
      if (QUEUEABLE[action] && !connectivity.isOnline()) return await enqueue()
      await request()
      setState({ pending: null, error: null })
      onChanged()
      return true
    } catch (failure) {
      const error = toViewError(failure, PLAN_ACTION_MESSAGES[action])
      if (QUEUEABLE[action] && isTransportFailure(error)) return await enqueue()
      setState({ pending: null, error })
      onChanged()
      return false
    } finally {
      busyRef.current = false
    }
  }, [onChanged, planId, planTitle])

  const join = useCallback(() => run(PLAN_ACTION.JOIN, () => joinPlan(planId)), [run, planId])
  const leave = useCallback(() => run(PLAN_ACTION.LEAVE, () => leavePlan(planId)), [run, planId])
  const closeSignUps = useCallback(() => run(PLAN_ACTION.CLOSE, () => updatePlan(planId, { status: 'closed' })), [run, planId])
  const reopenSignUps = useCallback(() => run(PLAN_ACTION.REOPEN, () => updatePlan(planId, { status: 'open' })), [run, planId])
  const cancel = useCallback(() => run(PLAN_ACTION.CANCEL, () => updatePlan(planId, { status: 'cancelled' })), [run, planId])
  const askSpotAlert = useCallback(() => run(PLAN_ACTION.SPOT_ALERT, () => requestSpotAlert(planId)), [run, planId])
  const cancelSpotAlertRequest = useCallback(() => run(PLAN_ACTION.CANCEL_SPOT_ALERT, () => cancelSpotAlert(planId)), [run, planId])

  /** Descarta algo de la cola de este plan (cancelar una inscripción pendiente, o dar por visto un rechazo). */
  const discardQueued = useCallback((id) => outbox.remove(id), [])

  const queuedOf = (type) => queuedItems.find((item) => item.type === type) ?? null
  const queued = {
    join: queuedOf(OUTBOX_TYPE.JOIN),
    leave: queuedOf(OUTBOX_TYPE.LEAVE),
    /** Algo de este plan está esperando en la cola (mientras tanto no se ofrece inscribirse ni darse de baja). */
    isWaiting: queuedItems.some((item) => item.status !== OUTBOX_STATUS.FAILED)
  }

  return {
    ...state, isBusy: state.pending !== null, join, leave, closeSignUps, reopenSignUps, cancel, askSpotAlert, cancelSpotAlert: cancelSpotAlertRequest, queued, discardQueued
  }
}
