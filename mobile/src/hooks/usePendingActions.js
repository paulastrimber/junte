import { useCallback } from 'react'

import { outbox } from '../services/offline/index.js'
import { useIsOnline, useOutbox } from './useOffline.js'

/**
 * La cola de pendientes completa (S6-MOB-02), para la pantalla "Pendientes": qué espera, qué falló y por qué.
 * Descartar y reintentar nunca dan nada por hecho: reintentar lo vuelve a mandar y espera al servidor.
 */
export function usePendingActions () {
  const isOnline = useIsOnline()
  const { items } = useOutbox()
  const discard = useCallback((id) => outbox.remove(id), [])
  const retry = useCallback((id) => outbox.retry(id), [])
  const sendNow = useCallback(() => outbox.flush(), [])
  return { items, isOnline, discard, retry, sendNow }
}
