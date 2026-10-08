import Constants from 'expo-constants'

// Configuración por entorno (sin secretos). La URL base sale de una sola fuente:
// EXPO_PUBLIC_API_URL → app.config.js (`extra.apiUrl`) → acá. Nadie más lee process.env.

export const API_TIMEOUT_MS = 10_000

/**
 * Devuelve la configuración de la API leída del manifiesto de Expo.
 * Se lee al usarla (no al importar el módulo) para que los tests no dependan del manifiesto.
 * @returns {{ apiUrl: string, appEnv: string }}
 * @throws {Error} si el manifiesto no trae `extra.apiUrl` (app.config.js no se evaluó con la variable).
 */
export function getConfig () {
  const extra = Constants.expoConfig?.extra ?? {}
  if (typeof extra.apiUrl !== 'string' || extra.apiUrl === '') {
    throw new Error('Falta extra.apiUrl en la configuración de Expo: revisá EXPO_PUBLIC_API_URL (mobile/.env o eas.json).')
  }
  return {
    apiUrl: extra.apiUrl,
    appEnv: extra.appEnv ?? 'development'
  }
}
