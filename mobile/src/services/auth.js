// Servicio de sesión (S2-MOB-01): login, registro, restauración al abrir la app, refresh y logout.
// Los tokens viven en expo-secure-store (tokenStorage). Es el "Model" de la app: no conoce pantallas.
import { Platform } from 'react-native'

import * as authApi from './api/auth.js'
import { ApiError } from './api/errors.js'
import * as usersApi from './api/users.js'
import { createTokenStorage } from './tokenStorage.js'

const UNAUTHORIZED = 401

/**
 * @param {object} deps
 * @param {ReturnType<typeof createTokenStorage>} deps.tokenStorage
 * @param {{ register: Function, login: Function, refresh: Function, logout: Function, logoutAll: Function, getMe: Function }} deps.api
 * @param {string} [deps.deviceLabel]  Etiqueta de la sesión en el servidor ("android", "ios").
 */
export function createAuthService ({ tokenStorage, api, deviceLabel }) {
  const expiredListeners = new Set()

  async function storeSession ({ user, accessToken, refreshToken }) {
    await tokenStorage.save({ accessToken, refreshToken })
    return user
  }

  /** Renueva el par de tokens. Un 401 del servidor significa que la sesión terminó: se borra la local. */
  async function refreshSession () {
    const refreshToken = tokenStorage.getRefreshToken()
    if (!refreshToken) throw new ApiError({ status: UNAUTHORIZED, code: 'UNAUTHENTICATED' })
    try {
      await tokenStorage.save(await api.refresh({ refreshToken }))
    } catch (error) {
      if (error?.status === UNAUTHORIZED) await tokenStorage.clear()
      throw error
    }
  }

  /** La sesión no se puede renovar: se borra y se avisa para volver al login. */
  async function handleSessionExpired (error) {
    await tokenStorage.clear()
    expiredListeners.forEach((listener) => listener(error))
  }

  return {
    /** @returns {Promise<object>} usuario */
    async login ({ email, password }) {
      return storeSession(await api.login({ email, password, deviceLabel }))
    },

    /** @returns {Promise<object>} usuario */
    async register ({ name, email, password }) {
      return storeSession(await api.register({ name, email, password, deviceLabel }))
    },

    /**
     * Al abrir la app: si hay sesión guardada, trae el perfil (el cliente HTTP renueva el token si venció).
     * @returns {Promise<object | null>} usuario, o null si no hay sesión o ya no sirve.
     * @throws {ApiError} si no se pudo verificar (p. ej. sin conexión): los tokens se conservan.
     */
    async restore () {
      if (!await tokenStorage.load()) return null
      try {
        return await api.getMe()
      } catch (error) {
        if (error?.status === UNAUTHORIZED) {
          await tokenStorage.clear()
          return null
        }
        throw error
      }
    },

    /** Cierra la sesión de este dispositivo. La local se borra aunque el servidor no responda. */
    async logout () {
      try {
        await api.logout()
      } catch {
        // Sin conexión o sesión ya cerrada: igual se cierra acá. El servidor la deja vencer.
      }
      await tokenStorage.clear()
    },

    /** Cierra todas las sesiones. Si el servidor no responde NO se cierra nada: el usuario tiene que saberlo. */
    async logoutAll () {
      await api.logoutAll()
      await tokenStorage.clear()
    },

    refreshSession,
    handleSessionExpired,

    /** @param {(error: ApiError) => void} listener @returns {() => void} cancelar suscripción */
    onSessionExpired (listener) {
      expiredListeners.add(listener)
      return () => expiredListeners.delete(listener)
    },

    /** Lo que el cliente HTTP necesita de la sesión (ver configureApiAuth). */
    apiAuth: {
      getAccessToken: () => tokenStorage.getAccessToken(),
      refreshSession,
      onSessionExpired: handleSessionExpired
    }
  }
}

/** Servicio compartido de la app. */
export const authService = createAuthService({
  tokenStorage: createTokenStorage(),
  api: { ...authApi, getMe: usersApi.getMe },
  deviceLabel: Platform.OS
})
