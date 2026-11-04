// Referencia al contenedor de navegación para abrir un plan desde fuera de una pantalla (aviso push o enlace).
import { createNavigationContainerRef } from '@react-navigation/native'

import { ROUTES } from './routes.js'

export const navigationRef = createNavigationContainerRef()

/** Abre el detalle del plan en el tab "Planes" (con el feed debajo, así "volver" funciona). */
export function openPlan (planId, ref = navigationRef) {
  if (!ref.isReady()) return false
  ref.navigate(ROUTES.FEED_TAB, { screen: ROUTES.PLAN, params: { planId }, initial: false })
  return true
}
