// Servicios compartidos del modo sin conexión (S6-MOB-01 y 02): conectividad, caché de lecturas y cola de pendientes.
// Docs: docs/arquitectura/05-mobile.md#offline.
import { AppState } from 'react-native'

import { sendMessage } from '../api/messages.js'
import { joinPlan, leavePlan } from '../api/participations.js'
import { createReport } from '../api/reports.js'
import { createReadCache } from './cache.js'
import { createConnectivity } from './connectivity.js'
import { OUTBOX_TYPE, createOutbox } from './outbox.js'
import { createKeyValueStore } from './storage.js'

export { CACHE_LIMITS, isTransportFailure, readThrough } from './cache.js'
export { OUTBOX_STATUS, OUTBOX_TYPE } from './outbox.js'

export const connectivity = createConnectivity()

export const readCache = createReadCache({ store: createKeyValueStore({ prefix: 'junte:cache:' }) })

/** Cómo se manda cada escritura encolada: la misma API que se usa con conexión. */
const EXECUTORS = Object.freeze({
  [OUTBOX_TYPE.JOIN]: ({ planId }) => joinPlan(planId),
  [OUTBOX_TYPE.LEAVE]: ({ planId }) => leavePlan(planId),
  [OUTBOX_TYPE.MESSAGE]: ({ planId, text, clientId }) => sendMessage(planId, { text, clientId }),
  [OUTBOX_TYPE.REPORT]: ({ targetType, targetId, reason, description }) => createReport({ targetType, targetId, reason, description })
})

export const outbox = createOutbox({ store: createKeyValueStore({ prefix: 'junte:outbox:' }), executors: EXECUTORS, connectivity })

/**
 * Lo arranca la app al iniciar: escucha la conexión y manda lo pendiente cuando vuelve la red o cuando la app vuelve a
 * primer plano (nunca en segundo plano ni con un timer: no gasta batería).
 * @returns {() => void} detener
 */
export function startOfflineSync ({ appState = AppState } = {}) {
  connectivity.start()
  const stopConnectivity = connectivity.subscribe((online) => { if (online) outbox.flush() })
  const subscription = appState.addEventListener('change', (state) => { if (state === 'active') outbox.flush() })
  // Lo que quedó pendiente de la última vez que se usó la app.
  outbox.flush()
  return () => {
    stopConnectivity()
    subscription.remove()
    connectivity.stop()
  }
}

/** Al cerrar sesión: lo guardado y lo pendiente son de esa cuenta. */
export function clearOfflineData () {
  return Promise.all([readCache.clear(), outbox.clear()])
}
