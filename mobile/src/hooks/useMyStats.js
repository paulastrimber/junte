import { useCallback, useEffect, useState } from 'react'

import { getMe } from '../services/api/users.js'
import { toViewError } from '../utils/errorMessages.js'

/**
 * Reputación y ausencias propias, pedidas al servidor (`GET /users/me`): solo el back las escribe y cambian sin que la
 * app haga nada (un check-in, el cierre de asistencia de un plan). Si falla, la pantalla muestra lo último conocido.
 * @param {{ reputation: number }} user  El usuario de la sesión (valor inicial mientras llega la respuesta).
 * @returns {{ reputation: number, noShowCount: number | null, reload: () => void }} `noShowCount` null = todavía no se sabe.
 */
export function useMyStats (user) {
  const [stats, setStats] = useState({ reputation: user.reputation, noShowCount: user.noShowCount ?? null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    getMe()
      .then((me) => {
        if (isCurrent) setStats({ reputation: me.reputation, noShowCount: me.noShowCount ?? null })
      })
      // Dato secundario de la pantalla: si falla se queda con lo que ya tenía, sin mostrar un error. Se deja rastro
      // en desarrollo (solo `code` y `requestId`: nunca el body).
      .catch((failure) => {
        if (!__DEV__) return
        const { code, requestId } = toViewError(failure)
        console.warn('useMyStats: no se pudieron actualizar las estadísticas', { code, requestId })
      })
    return () => { isCurrent = false }
  }, [attempt])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  return { ...stats, reload }
}
