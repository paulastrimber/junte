// Almacenamiento clave → JSON en el teléfono (AsyncStorage), con un prefijo por uso. Nunca lanza: si el teléfono no
// puede leer o escribir, la app sigue funcionando sin caché (lo guardado es una comodidad, no la fuente de verdad).
// Acá no va nada secreto: los tokens siguen en expo-secure-store (services/tokenStorage.js).
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * @param {object} params
 * @param {string} params.prefix  P. ej. `junte:cache:`. `removeAll` borra solo las claves con este prefijo.
 * @param {typeof AsyncStorage} [params.backend]
 */
export function createKeyValueStore ({ prefix, backend = AsyncStorage }) {
  return {
    /** @returns {Promise<any | null>} null si no hay nada (o no se pudo leer). */
    async read (key) {
      try {
        const raw = await backend.getItem(`${prefix}${key}`)
        return raw === null || raw === undefined ? null : JSON.parse(raw)
      } catch {
        return null
      }
    },

    /** @returns {Promise<boolean>} false si no se pudo guardar. */
    async write (key, value) {
      try {
        await backend.setItem(`${prefix}${key}`, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    },

    async remove (key) {
      try {
        await backend.removeItem(`${prefix}${key}`)
      } catch {
        // Nada que hacer: a lo sumo queda un dato viejo que se pisa o se borra después.
      }
    },

    /** Borra todo lo de este prefijo (al cerrar sesión). */
    async removeAll () {
      try {
        const keys = (await backend.getAllKeys()).filter((key) => key.startsWith(prefix))
        if (keys.length > 0) await backend.multiRemove(keys)
      } catch {
        // Ídem.
      }
    }
  }
}
