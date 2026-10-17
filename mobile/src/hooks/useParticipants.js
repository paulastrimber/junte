import { useCallback } from 'react'

import { listParticipants } from '../services/api/participations.js'
import { usePagedList } from './usePagedList.js'

const PAGE_SIZE = 20

/**
 * Anotados de un plan (nombre, foto y reputación). Solo los ven los participantes activos y el creador: con
 * `enabled: false` no se pide nada. Cuando cambió la lista (alguien se inscribió o se dio de baja) se llama a
 * `refresh`, que la vuelve a pedir sin vaciarla ni pasar por "cargando".
 * @param {string} planId
 * @param {{ enabled: boolean }} options
 */
export function useParticipants (planId, { enabled }) {
  const fetchPage = useCallback(
    (cursor) => listParticipants(planId, { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [planId]
  )
  return usePagedList(fetchPage, { enabled })
}
