import { useEffect } from 'react'
import { AppState } from 'react-native'

import { nextPlanMilestone } from '../utils/attendance.js'

// Pequeño margen después del momento exacto: al refrescar, el servidor ya está del otro lado del borde.
const AFTER_MILESTONE_MS = 1_000
// `setTimeout` no admite esperas de más de ~24 días; un detalle abierto tanto tiempo se refresca al volver a la app.
const MAX_WAIT_MS = 24 * 60 * 60 * 1000

/**
 * Mantiene al día el detalle de un plan sin que haya que salir y volver a entrar:
 * - cuando llega el próximo momento que cambia lo que se puede hacer (abre o cierra el horario de asistencia, empieza
 *   o termina el plan), para que el botón de asistencia aparezca solo;
 * - cuando la app vuelve a primer plano.
 * @param {object | null} plan  Detalle del plan (o null mientras carga).
 * @param {() => void} refresh  Vuelve a pedir el plan sin pasar por "cargando".
 */
export function usePlanAutoRefresh (plan, refresh) {
  // Cada plan nuevo (cada refresco) vuelve a programar el próximo momento.
  useEffect(() => {
    if (!plan) return undefined
    const milestone = nextPlanMilestone(plan)
    if (!milestone) return undefined
    const wait = milestone.getTime() - Date.now() + AFTER_MILESTONE_MS
    if (wait > MAX_WAIT_MS) return undefined
    const timer = setTimeout(refresh, wait)
    return () => clearTimeout(timer)
  }, [plan, refresh])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => subscription.remove()
  }, [refresh])
}
