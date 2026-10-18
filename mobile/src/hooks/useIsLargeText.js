import { useWindowDimensions } from 'react-native'

import { LARGE_TEXT_SCALE } from '../theme/index.js'

/**
 * `true` si el usuario eligió texto grande en el sistema (`fontScale ≥ LARGE_TEXT_SCALE`). Se vuelve a renderizar
 * cuando lo cambia. Para decidir el layout (fila o columna), no el tamaño de la letra: eso ya lo hace `Text`.
 * @returns {boolean}
 */
export function useIsLargeText () {
  return useWindowDimensions().fontScale >= LARGE_TEXT_SCALE
}
