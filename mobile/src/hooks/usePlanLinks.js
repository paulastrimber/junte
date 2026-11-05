import { useEffect } from 'react'
import { Linking as DefaultLinking } from 'react-native'

import { openPlan as defaultOpenPlan } from '../navigation/navigationRef.js'
import { pushService as defaultPush } from '../services/push.js'
import { planIdFromLink } from '../utils/planLinks.js'

/**
 * Con la sesión iniciada: registra el teléfono para avisos push y abre el plan cuando la persona toca un aviso o un
 * enlace `junte://plans/<id>` (también si eso fue lo que abrió la app: se atiende cuando ya hay sesión).
 * @param {object} [deps]  Inyectables para tests.
 */
export function usePlanLinks ({ push = defaultPush, linking = DefaultLinking, openPlan = defaultOpenPlan } = {}) {
  useEffect(() => {
    let active = true
    // Recién montado el navegador puede no estar listo: se reintenta un momento después.
    const open = (planId) => {
      if (!planId || !active) return
      if (!openPlan(planId)) setTimeout(() => { if (active) openPlan(planId) }, 300)
    }
    push.register()
    push.initialPlanId().then(open).catch(() => {})
    linking.getInitialURL().then((url) => open(planIdFromLink(url))).catch(() => {})
    const stopPush = push.onPlanOpened(open)
    const linkSubscription = linking.addEventListener('url', ({ url }) => open(planIdFromLink(url)))
    return () => {
      active = false
      stopPush()
      linkSubscription.remove()
    }
  }, [push, linking, openPlan])
}
