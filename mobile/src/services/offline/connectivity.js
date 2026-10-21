// ¿Hay conexión? Lo informa NetInfo (Wi-Fi o datos, y si llega a Internet). Mientras no se sabe, se asume que sí:
// la app intenta y, si la request falla por red, recién ahí usa lo guardado.
import NetInfo from '@react-native-community/netinfo'

/** NetInfo dice "sin conexión" solo cuando lo sabe: `null` (todavía no lo midió) cuenta como conectado. */
export const isOnlineState = (state) => state?.isConnected !== false && state?.isInternetReachable !== false

/**
 * @param {{ netInfo?: typeof NetInfo }} [deps]
 */
export function createConnectivity ({ netInfo = NetInfo } = {}) {
  let online = true
  let stopListening = null
  const listeners = new Set()

  function update (next) {
    if (next === online) return
    online = next
    listeners.forEach((listener) => listener(next))
  }

  return {
    /** Empieza a escuchar a NetInfo (lo hace la app al arrancar). Idempotente. */
    start () {
      if (stopListening) return
      stopListening = netInfo.addEventListener((state) => update(isOnlineState(state)))
      Promise.resolve(netInfo.fetch()).then((state) => update(isOnlineState(state))).catch(() => {})
    },

    stop () {
      stopListening?.()
      stopListening = null
    },

    isOnline: () => online,

    /** @param {(online: boolean) => void} listener @returns {() => void} cancelar suscripción */
    subscribe (listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
