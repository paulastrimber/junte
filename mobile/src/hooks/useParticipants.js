import { useCallback } from 'react'

import { listParticipants } from '../services/api/participations.js'
import { usePagedList } from './usePagedList.js'

const PAGE_SIZE = 20

/**
 * Anotados de un plan (nombre, foto y reputación). Solo los ven los participantes activos y el creador: con
 * `enabled: false` no se pide nada. `version` cambia cuando cambió la lista (alguien se inscribió o se dio de baja).
 * @param {string} planId
 * @param {{ enabled: boolean, version?: number }} options
 */
export function useParticipants (planId, { enabled, version = 0 }) {
  const fetchPage = useCallback(
    (cursor) => listParticipants(planId, { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    // `version` no se usa adentro: está para volver a pedir la lista cuando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, version]
  )
  return usePagedList(fetchPage, { enabled })
}
