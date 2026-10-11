// Access y refresh token en el almacenamiento seguro del SO (Keychain / Keystore) vía expo-secure-store.
// Nunca en AsyncStorage ni en logs. Se mantiene una copia en memoria para no leer el Keystore en cada request.
import * as SecureStore from 'expo-secure-store'

const ACCESS_KEY = 'junte.accessToken'
const REFRESH_KEY = 'junte.refreshToken'

/**
 * @param {{ secureStore?: Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'> }} [deps]
 */
export function createTokenStorage ({ secureStore = SecureStore } = {}) {
  let accessToken = null
  let refreshToken = null

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,

    /**
     * Lee la sesión guardada. No lanza: si el Keystore falla, la app pide iniciar sesión.
     * @returns {Promise<boolean>} true si había una sesión completa.
     */
    async load () {
      try {
        const [access, refresh] = await Promise.all([secureStore.getItemAsync(ACCESS_KEY), secureStore.getItemAsync(REFRESH_KEY)])
        if (!access || !refresh) return false
        accessToken = access
        refreshToken = refresh
        return true
      } catch {
        return false
      }
    },

    /** @param {{ accessToken: string, refreshToken: string }} tokens */
    async save (tokens) {
      accessToken = tokens.accessToken
      refreshToken = tokens.refreshToken
      await Promise.all([
        secureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
        secureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken)
      ])
    },

    async clear () {
      accessToken = null
      refreshToken = null
      await Promise.all([secureStore.deleteItemAsync(ACCESS_KEY), secureStore.deleteItemAsync(REFRESH_KEY)])
    }
  }
}
