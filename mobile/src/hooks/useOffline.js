import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'

import { ApiError } from '../services/api/errors.js'
import {
  OUTBOX_STATUS, connectivity as defaultConnectivity, outbox as defaultOutbox, startOfflineSync as defaultStart
} from '../services/offline/index.js'

/**
 * Mientras está montado (solo con la sesión iniciada: la cola necesita el token), escucha la conexión y manda lo
 * pendiente cuando vuelve la red o la app vuelve a primer plano (S6-MOB-02).
 * @param {{ start?: typeof defaultStart }} [deps]
 */
export function useOfflineSync ({ start = defaultStart } = {}) {
  useEffect(() => start(), [start])
}

/**
 * ¿Hay conexión? Se actualiza solo cuando cambia.
 * @param {{ connectivity?: typeof defaultConnectivity }} [deps]  Inyectable para tests.
 */
export function useIsOnline ({ connectivity = defaultConnectivity } = {}) {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline)
}

/**
 * La cola de pendientes, opcionalmente filtrada (p. ej. las de un plan).
 * @param {(item: import('../services/offline/outbox.js').OutboxItem) => boolean} [filter]  Estable entre renders.
 * @param {{ outbox?: typeof defaultOutbox }} [deps]
 */
export function useOutbox (filter, { outbox = defaultOutbox } = {}) {
  const [items, setItems] = useState(() => outbox.peek())
  useEffect(() => outbox.subscribe(setItems), [outbox])
  // En el teléfono el error se guarda como datos planos: vuelve a ser un ApiError para mostrarlo según su `code`.
  const visible = (filter ? items.filter(filter) : items).map((item) => (item.error && !(item.error instanceof ApiError) ? { ...item, error: new ApiError(item.error) } : item))
  return {
    items: visible,
    pendingCount: visible.filter((item) => item.status !== OUTBOX_STATUS.FAILED).length,
    failedCount: visible.filter((item) => item.status === OUTBOX_STATUS.FAILED).length
  }
}

/**
 * Lo que necesita el aviso de conexión de una pantalla (`OfflineNotice`): si hay red y cuánto espera en la cola.
 * @param {{ connectivity?: typeof defaultConnectivity, outbox?: typeof defaultOutbox }} [deps]
 */
export function useOfflineStatus (deps = {}) {
  const isOnline = useIsOnline(deps)
  const { pendingCount, failedCount } = useOutbox(undefined, deps)
  return { isOnline, pendingCount, failedCount }
}

/**
 * La app está en primer plano. En segundo plano no se hace polling ni se mantiene el WebSocket abierto (S6-MOB-04).
 * `inactive` (iOS, un instante al abrir el centro de control o cambiar de app) no cuenta como segundo plano.
 * @param {{ appState?: typeof AppState }} [deps]
 */
export function useIsForeground ({ appState = AppState } = {}) {
  const [isForeground, setIsForeground] = useState(() => appState.currentState !== 'background')
  useEffect(() => {
    const subscription = appState.addEventListener('change', (state) => setIsForeground(state !== 'background'))
    return () => subscription.remove()
  }, [appState])
  return isForeground
}
