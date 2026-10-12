// Cámara (expo-camera): solo para leer el QR de asistencia. El permiso se pide en el momento en que se usa.
import { Camera } from 'expo-camera'

/** @returns {Promise<boolean>} true si hay permiso de cámara (lo pide si hace falta). Nunca rechaza. */
export async function requestCameraPermission () {
  try {
    const { status } = await Camera.requestCameraPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}
