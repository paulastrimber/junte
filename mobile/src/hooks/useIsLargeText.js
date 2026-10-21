import { useSyncExternalStore } from 'react'
import { Dimensions } from 'react-native'

import { LARGE_TEXT_SCALE } from '../theme/index.js'

function subscribe (onChange) {
  const subscription = Dimensions.addEventListener('change', onChange)
  return () => subscription.remove()
}

const isLargeText = () => Dimensions.get('window').fontScale >= LARGE_TEXT_SCALE

/**
 * `true` si el usuario eligió texto grande en el sistema (`fontScale ≥ LARGE_TEXT_SCALE`). Para decidir el layout
 * (fila o columna), no el tamaño de la letra: eso ya lo hace `Text`.
 *
 * No usa `useWindowDimensions`, que vuelve a renderizar con cada cambio de tamaño de la ventana (pantalla dividida,
 * plegables): acá solo se vuelve a renderizar cuando el resultado pasa de `false` a `true` o al revés.
 * @returns {boolean}
 */
export function useIsLargeText () {
  return useSyncExternalStore(subscribe, isLargeText)
}
