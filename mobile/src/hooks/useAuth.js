import { useContext, useMemo } from 'react'

import { AuthContext } from '../contexts/AuthContext.jsx'
import { toViewError } from '../utils/errorMessages.js'

/**
 * Estado de la sesión y sus acciones. `error` (por qué no se pudo restaurar la sesión) llega listo para pintar;
 * `sessionEndedBy` es el motivo crudo con el que terminó la sesión (lo traduce `useLoginForm`).
 * @returns {{
 *   status: string, user: object | null, error: import('../utils/errorMessages.js').ViewError | null,
 *   sessionEndedBy: Error | null,
 *   signIn: (credentials: { email: string, password: string }) => Promise<object>,
 *   signUp: (data: { name: string, email: string, password: string }) => Promise<object>,
 *   signOut: () => Promise<void>, signOutAll: () => Promise<void>,
 *   setUser: (user: object) => void, retryRestore: () => Promise<void>
 * }}
 */
export function useAuth () {
  const context = useContext(AuthContext)
  const failure = context?.error
  const error = useMemo(() => (failure ? toViewError(failure) : null), [failure])
  const value = useMemo(() => (context ? { ...context, error } : null), [context, error])
  if (!value) throw new Error('useAuth debe usarse dentro de un AuthProvider')
  return value
}
