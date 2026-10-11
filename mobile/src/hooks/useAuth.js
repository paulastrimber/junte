import { useContext } from 'react'

import { AuthContext } from '../contexts/AuthContext.jsx'

/**
 * Estado de la sesión y sus acciones.
 * @returns {{
 *   status: string, user: object | null, error: Error | null, sessionEndedBy: Error | null,
 *   signIn: (credentials: { email: string, password: string }) => Promise<object>,
 *   signUp: (data: { name: string, email: string, password: string }) => Promise<object>,
 *   signOut: () => Promise<void>, signOutAll: () => Promise<void>,
 *   setUser: (user: object) => void, retryRestore: () => Promise<void>
 * }}
 */
export function useAuth () {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de un AuthProvider')
  return context
}
