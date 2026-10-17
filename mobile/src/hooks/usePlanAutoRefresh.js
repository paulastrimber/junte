import { useEffect, useRef } from 'react'
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
 * - cuando la app vuelve de segundo plano (`background` → `active`), si la pantalla está a la vista. Un `inactive`
 *   (centro de control, un diálogo de permisos, Face ID) no cuenta: la app nunca dejó de verse. Si la pantalla no está
 *   a la vista no hace nada: al volver a ella ya refresca `useRefreshOnFocus`.
 * @param {object | null} plan  Detalle del plan (o null mientras carga).
 * @param {() => void} refresh  Vuelve a pedir el plan sin pasar por "cargando".
 * @param {{ isFocused?: boolean, onForeground?: () => void }} [options]  `onForeground`: qué refrescar al volver de
 *   segundo plano (por defecto, `refresh`; el detalle refresca también la lista de anotados).
 */
export function usePlanAutoRefresh (plan, refresh, { isFocused = true, onForeground = refresh } = {}) {
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

  // El listener lee el foco y la función más recientes sin volver a suscribirse en cada render.
  const latestRef = useRef({ isFocused, onForeground })
  useEffect(() => { latestRef.current = { isFocused, onForeground } }, [isFocused, onForeground])

  useEffect(() => {
    let previous = AppState.currentState
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInBackground = previous === 'background'
      previous = next
      if (next === 'active' && wasInBackground && latestRef.current.isFocused) latestRef.current.onForeground()
    })
    return () => subscription.remove()
  }, [])
}
