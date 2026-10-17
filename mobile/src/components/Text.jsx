import { Text as NativeText } from 'react-native'

import { fontScaleLimits, typography, useTheme } from '../theme/index.js'

/**
 * Texto de la app: aplica la tipografía y el color del tema. Las pantallas eligen una variante, no un `fontSize`.
 * Respeta el tamaño de letra del sistema, con un tope por variante (`fontScaleLimits`) para que los títulos no
 * rompan la pantalla.
 * @param {object} props
 * @param {keyof typeof typography} [props.variant]
 * @param {string} [props.color]  Rol de color del tema ('text', 'textMuted', 'primary', 'danger'…).
 * @param {boolean} [props.center]
 */
export function Text ({ variant = 'body', color = 'text', center = false, style, ...props }) {
  const { colors } = useTheme()
  return (
    <NativeText
      maxFontSizeMultiplier={fontScaleLimits[variant] ?? fontScaleLimits.default}
      style={[typography[variant], { color: colors[color] }, center && centered, style]}
      {...props}
    />
  )
}

const centered = { textAlign: 'center' }
