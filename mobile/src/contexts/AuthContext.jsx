import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

import { clearPhotoCache } from '../components/Avatar.jsx'
import { authService as defaultService } from '../services/auth.js'

// Estado global mínimo de la sesión (Model de la app): quién está logueado y en qué fase.
export const AUTH_STATUS = Object.freeze({
  /** Leyendo la sesión guardada en el teléfono. */
  LOADING: 'loading',
  SIGNED_OUT: 'signedOut',
  SIGNED_IN: 'signedIn',
  /** Hay sesión guardada pero no se pudo verificar (p. ej. sin conexión): se conserva y se reintenta. */
  RESTORE_ERROR: 'restoreError'
})

export const AuthContext = createContext(null)

/**
 * @param {object} props
 * @param {ReturnType<import('../services/auth.js').createAuthService>} [props.service]  Inyectable para tests.
 */
export function AuthProvider ({ service = defaultService, children }) {
  const [state, setState] = useState({ status: AUTH_STATUS.LOADING, user: null, error: null, sessionEndedBy: null })

  const restore = useCallback(async () => {
    try {
      const user = await service.restore()
      setState((current) => ({ ...current, status: user ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.SIGNED_OUT, user, error: null }))
    } catch (error) {
      setState((current) => ({ ...current, status: AUTH_STATUS.RESTORE_ERROR, user: null, error }))
    }
  }, [service])

  useEffect(() => {
    restore()
  }, [restore])

  // El cliente HTTP avisa cuando el refresh es rechazado: se vuelve al login conservando el motivo.
  useEffect(() => service.onSessionExpired((reason) => {
    clearPhotoCache()
    setState({ status: AUTH_STATUS.SIGNED_OUT, user: null, error: null, sessionEndedBy: reason })
  }), [service])

  const signedIn = useCallback((user) => {
    setState({ status: AUTH_STATUS.SIGNED_IN, user, error: null, sessionEndedBy: null })
    return user
  }, [])

  // Las fotos cacheadas son de otras personas: no quedan en el teléfono para la próxima sesión. `clearPhotoCache`
  // nunca rechaza y no se espera: un fallo o una demora del caché no traban el cierre de sesión.
  const signedOut = useCallback(() => {
    clearPhotoCache()
    setState({ status: AUTH_STATUS.SIGNED_OUT, user: null, error: null, sessionEndedBy: null })
  }, [])

  const value = useMemo(() => ({
    ...state,
    signIn: async (credentials) => signedIn(await service.login(credentials)),
    signUp: async (data) => signedIn(await service.register(data)),
    signOut: async () => { await service.logout(); signedOut() },
    signOutAll: async () => { await service.logoutAll(); signedOut() },
    setUser: (user) => {
      // También queda guardado en el teléfono: la app se puede abrir sin conexión con el perfil al día.
      service.rememberUser?.(user)
      setState((current) => ({ ...current, user }))
    },
    retryRestore: async () => {
      setState((current) => ({ ...current, status: AUTH_STATUS.LOADING, error: null }))
      await restore()
    }
  }), [state, service, signedIn, signedOut, restore])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
