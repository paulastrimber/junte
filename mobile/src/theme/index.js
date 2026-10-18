import { StyleSheet, useColorScheme } from 'react-native'

import { palettes } from './colors.js'
import { shadows } from './tokens.js'

export { palettes } from './colors.js'
export { navigationTheme, stackScreenOptions, tabScreenOptions } from './navigation.js'
export { borders, motion, radius, sizes, spacing } from './tokens.js'
export { LARGE_TEXT_SCALE, fontAssets, fontScaleLimits, fonts, typography } from './typography.js'
export { useReducedMotion } from './useReducedMotion.js'

const themes = Object.freeze({
  light: Object.freeze({ scheme: 'light', isDark: false, colors: palettes.light, shadows: shadows.light }),
  dark: Object.freeze({ scheme: 'dark', isDark: true, colors: palettes.dark, shadows: shadows.dark })
})

/**
 * Tema según el modo del sistema (claro u oscuro). Se vuelve a renderizar cuando el usuario lo cambia.
 * @returns {{ scheme: 'light' | 'dark', isDark: boolean, colors: typeof palettes.light, shadows: { card?: string, raised?: string } }}
 */
export function useTheme () {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light']
}

/**
 * Estilos que dependen del tema. Se declaran una vez por archivo, fuera del componente, y se crean una sola vez
 * por modo:
 *
 *   const useStyles = createThemedStyles(({ colors }) => ({ box: { backgroundColor: colors.surface } }))
 *   // …dentro del componente:
 *   const styles = useStyles()
 *
 * @template T
 * @param {(theme: ReturnType<typeof useTheme>) => T} factory
 * @returns {() => T}
 */
export function createThemedStyles (factory) {
  const cache = {}
  return function useThemedStyles () {
    const theme = useTheme()
    cache[theme.scheme] ??= StyleSheet.create(factory(theme))
    return cache[theme.scheme]
  }
}
