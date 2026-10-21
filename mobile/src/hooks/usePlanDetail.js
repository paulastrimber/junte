import { useCallback, useMemo, useState } from 'react'

import { planActions } from '../utils/attendance.js'
import { interestNames } from '../utils/catalog.js'
import { useCatalogs } from './useCatalogs.js'
import { useParticipants } from './useParticipants.js'
import { usePlan } from './usePlan.js'
import { PLAN_ACTION, usePlanActions } from './usePlanActions.js'
import { usePlanAutoRefresh } from './usePlanAutoRefresh.js'
import { useRefreshOnFocus, useScreenFocus } from './useScreenFocus.js'

// Acciones que se confirman antes de mandarse: cancelar no se puede deshacer y, al darse de baja, el lugar liberado
// lo puede ocupar otra persona.
const CONFIRMABLE = Object.freeze([PLAN_ACTION.CANCEL, PLAN_ACTION.LEAVE])

/**
 * Controller del detalle de un plan: el plan, lo que el usuario puede hacer, las acciones, la lista de anotados y la
 * confirmación de las acciones que no tienen vuelta atrás. La pantalla solo pinta lo que devuelve.
 *
 * Cada cambio confirmado por el servidor vuelve a pedir el plan y la lista de anotados, los dos sin pasar por
 * "cargando" (lo que se ve queda a la vista hasta que llega lo nuevo). También se refresca al volver a la pantalla (del
 * QR, del check-in), cuando llega el próximo momento que cambia lo que se puede hacer (solo el plan) y cuando la app
 * vuelve de segundo plano con el detalle a la vista.
 * @param {string} planId
 * @param {object} options
 * @param {number} [options.version]  Cambia al volver de editar el plan: lo pide otra vez desde "cargando".
 * @param {{ addListener: (event: string, handler: () => void) => () => void }} options.navigation
 */
export function usePlanDetail (planId, { version = 0, navigation }) {
  const { status, plan, error, refreshError, savedAt, reload, refresh } = usePlan(planId, version)
  const { catalog } = useCatalogs()

  const can = useMemo(() => (plan ? planActions(plan) : null), [plan])
  const participants = useParticipants(planId, { enabled: Boolean(can?.canSeeParticipants) })
  const refreshParticipants = participants.refresh
  const onChanged = useCallback(() => {
    refresh()
    refreshParticipants()
  }, [refresh, refreshParticipants])

  const actions = usePlanActions(planId, { onChanged, planTitle: plan?.title ?? null })
  const activities = useMemo(() => (plan ? interestNames(plan.interests, catalog) : []), [plan, catalog])

  useRefreshOnFocus(navigation, onChanged)
  const isFocused = useScreenFocus(navigation)
  usePlanAutoRefresh(plan, refresh, { isFocused, onForeground: onChanged })

  // Qué acción espera confirmación (`PLAN_ACTION.CANCEL` o `PLAN_ACTION.LEAVE`), o null.
  const [confirming, setConfirming] = useState(null)
  const { cancel, leave } = actions
  const askConfirm = useCallback((action) => {
    if (CONFIRMABLE.includes(action)) setConfirming(action)
  }, [])
  const askCancel = useCallback(() => askConfirm(PLAN_ACTION.CANCEL), [askConfirm])
  const askLeave = useCallback(() => askConfirm(PLAN_ACTION.LEAVE), [askConfirm])
  const dismissConfirm = useCallback(() => setConfirming(null), [])
  const confirm = useCallback(async () => {
    const run = confirming === PLAN_ACTION.CANCEL ? cancel : leave
    // Salga bien o mal, la confirmación se cierra: si falló, el error se ve junto a las acciones.
    await run()
    setConfirming(null)
  }, [confirming, cancel, leave])

  return {
    status,
    plan,
    error,
    refreshError,
    savedAt,
    reload,
    can,
    activities,
    actions,
    participants,
    confirmation: { action: confirming, askCancel, askLeave, confirm, dismiss: dismissConfirm }
  }
}
