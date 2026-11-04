// Avisos push (S5-MOB-03): permiso, token nativo de FCM (`getDevicePushTokenAsync`), registro en /devices, baja al
// cerrar sesión y el plan que hay que abrir cuando la persona toca un aviso.
// Funciona en un development build con google-services.json (S5-MOB-04); en Expo Go o sin Firebase configurado el
// token no se puede obtener: se ignora en silencio (la app funciona igual, sin avisos).
import * as ExpoNotifications from 'expo-notifications'
import { Platform } from 'react-native'

import * as devicesApi from './api/devices.js'

/** Canal de Android de los avisos (obligatorio desde Android 8). */
export const ANDROID_CHANNEL_ID = 'default'

/** El plan de un aviso del back (`data: { type, planId }`), o null. */
export function planIdFromResponse (response) {
  const planId = response?.notification?.request?.content?.data?.planId
  return typeof planId === 'string' && /^[0-9a-f]{24}$/.test(planId) ? planId : null
}

/**
 * @param {object} [deps]  Inyectables para tests.
 * @param {typeof ExpoNotifications} [deps.notifications]
 * @param {{ registerDevice: Function, unregisterDevice: Function }} [deps.devices]
 * @param {string} [deps.platform]
 */
export function createPushService ({ notifications = ExpoNotifications, devices = devicesApi, platform = Platform.OS } = {}) {
  let token = null
  let tokenSubscription = null
  let handledResponseId = null

  async function hasPermission () {
    const current = await notifications.getPermissionsAsync()
    if (current.granted) return true
    if (current.canAskAgain === false) return false
    return (await notifications.requestPermissionsAsync()).granted
  }

  async function registerToken (value) {
    await devices.registerDevice({ token: value, platform })
    token = value
  }

  return {
    /** Muestra los avisos también con la app abierta (banner, sin sonido ni badge). Se llama una vez al arrancar. */
    configure () {
      notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false })
      })
    },

    /**
     * Con la sesión iniciada: pide permiso (una vez), obtiene el token nativo y lo registra en el back. Si el token
     * cambia (FCM lo rota) lo vuelve a registrar. Nunca lanza.
     * @returns {Promise<string | null>} el token registrado, o null si no hay permiso o no se pudo.
     */
    async register () {
      try {
        if (!await hasPermission()) return null
        if (platform === 'android') {
          await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, { name: 'Avisos de tus planes', importance: notifications.AndroidImportance.HIGH })
        }
        const { data } = await notifications.getDevicePushTokenAsync()
        await registerToken(data)
        tokenSubscription ??= notifications.addPushTokenListener(({ data: next }) => {
          if (next && next !== token) registerToken(next).catch(() => {})
        })
        return token
      } catch {
        // Expo Go, sin Google Play Services, sin google-services.json o sin conexión: la app sigue sin avisos.
        return null
      }
    },

    /** Al cerrar sesión (con el token de acceso todavía válido): el teléfono deja de recibir avisos de esta cuenta. */
    async unregister () {
      tokenSubscription?.remove()
      tokenSubscription = null
      const current = token
      token = null
      if (!current) return
      try {
        await devices.unregisterDevice(current)
      } catch {
        // Sin conexión: el back lo reasigna o lo borra cuando FCM lo informe inválido.
      }
    },

    /**
     * Plan del aviso que abrió la app (si la abrió un aviso). Cada aviso se entrega una sola vez.
     * @returns {Promise<string | null>}
     */
    async initialPlanId () {
      const response = await notifications.getLastNotificationResponseAsync().catch(() => null)
      const id = response?.notification?.request?.identifier ?? null
      if (!response || id === handledResponseId) return null
      handledResponseId = id
      return planIdFromResponse(response)
    },

    /** @param {(planId: string) => void} listener  Se llama cuando la persona toca un aviso. @returns {() => void} */
    onPlanOpened (listener) {
      const subscription = notifications.addNotificationResponseReceivedListener((response) => {
        handledResponseId = response?.notification?.request?.identifier ?? handledResponseId
        const planId = planIdFromResponse(response)
        if (planId) listener(planId)
      })
      return () => subscription.remove()
    }
  }
}

/** Servicio compartido de la app. */
export const pushService = createPushService()
