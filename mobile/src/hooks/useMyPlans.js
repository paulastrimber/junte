import { useCallback } from 'react'

import { listMyPlans } from '../services/api/plans.js'
import { usePagedList } from './usePagedList.js'

export const MY_PLANS_ROLE = Object.freeze({ CREATED: 'created', JOINED: 'joined' })
export const MY_PLANS_WHEN = Object.freeze({ UPCOMING: 'upcoming', PAST: 'past' })

const PAGE_SIZE = 20

/**
 * "Mis planes": los que creó el usuario o aquellos en los que está inscripto, próximos o pasados.
 * Al cambiar `role` o `when` se vuelve a pedir desde la primera página. Sin conexión, la última guardada.
 * @param {{ role: 'created' | 'joined', when: 'upcoming' | 'past' }} params
 */
export function useMyPlans ({ role, when }) {
  const fetchPage = useCallback(
    (cursor) => listMyPlans({ role, when, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    [role, when]
  )
  return usePagedList(fetchPage, { cacheKey: `myPlans:${role}-${when}` })
}
