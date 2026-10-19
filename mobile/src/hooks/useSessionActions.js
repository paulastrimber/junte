import { useState } from 'react'

import { toViewError } from '../utils/errorMessages.js'
import { useAuth } from './useAuth.js'

/**
 * Cerrar sesión en este dispositivo o en todos. Cerrar en este dispositivo nunca falla (la sesión local
 * se borra aunque no haya conexión); cerrar en todos necesita al servidor y muestra el error si no responde.
 * @returns {{ signOut: () => Promise<void>, signOutAll: () => Promise<void>, isWorking: boolean, error: import('../utils/errorMessages.js').ViewError | null }}
 */
export function useSessionActions () {
  const { signOut, signOutAll } = useAuth()
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState(null)

  async function run (action) {
    if (isWorking) return
    setIsWorking(true)
    setError(null)
    try {
      await action()
    } catch (failure) {
      setError(toViewError(failure))
      setIsWorking(false)
    }
    // Si salió bien, la pantalla se desmonta (la navegación pasa al login): no hay estado que volver a tocar.
  }

  return { signOut: () => run(signOut), signOutAll: () => run(signOutAll), isWorking, error }
}
