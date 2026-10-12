// Ubicación del teléfono (expo-location). El permiso se pide en el momento en que se usa (feed cercano, elegir el lugar
// de un plan) y, si se niega, quien llama degrada con elegancia: nada de esto rechaza por falta de permiso.
// Las coordenadas salen SIEMPRE como GeoJSON `[lng, lat]` (convención de la API) y no se guardan ni se loguean.
import * as Location from 'expo-location'

export const LOCATION_STATUS = Object.freeze({
  /** Hay posición. */
  GRANTED: 'granted',
  /** La persona no dio permiso (o lo quitó). */
  DENIED: 'denied',
  /** Hay permiso pero no se pudo obtener la posición (GPS apagado, sin señal, tiempo agotado). */
  UNAVAILABLE: 'unavailable'
})

/** @returns {Promise<boolean>} true si hay permiso de ubicación mientras se usa la app (lo pide si hace falta). */
export async function requestLocationPermission () {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

/**
 * Posición actual del teléfono.
 * @returns {Promise<{ status: 'granted', coordinates: [number, number] } | { status: 'denied' | 'unavailable', coordinates: null }>}
 */
export async function getCurrentCoordinates () {
  if (!await requestLocationPermission()) return { status: LOCATION_STATUS.DENIED, coordinates: null }
  try {
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { status: LOCATION_STATUS.GRANTED, coordinates: [coords.longitude, coords.latitude] }
  } catch {
    return { status: LOCATION_STATUS.UNAVAILABLE, coordinates: null }
  }
}

/**
 * Busca una dirección con el geocodificador del teléfono (sin API de Places ni claves).
 * @param {string} address
 * @returns {Promise<[number, number] | null>} `[lng, lat]` del primer resultado; null si no se encontró o falló.
 */
export async function findAddress (address) {
  const text = address.trim()
  if (text === '') return null
  try {
    const [first] = await Location.geocodeAsync(text)
    return first ? [first.longitude, first.latitude] : null
  } catch {
    return null
  }
}
