import { Pressable, View } from 'react-native'

import { borders, createThemedStyles, motion, radius, spacing, useTheme } from '../theme/index.js'

/**
 * Superficie que agrupa contenido relacionado (datos del plan, quién organiza, tu reputación). Recibe `children`:
 * no sabe qué muestra. Si se pasa `onPress`, toda la tarjeta es un botón y necesita `accessibilityLabel`.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {'elevated' | 'outlined' | 'tinted'} [props.variant]  `elevated`: sobre el fondo de la pantalla;
 *   `outlined`: dentro de otra superficie; `tinted`: violeta suave, para destacar una sola cosa por pantalla.
 * @param {'md' | 'lg'} [props.padding]
 * @param {() => void} [props.onPress]
 * @param {string} [props.accessibilityLabel]  Obligatorio con `onPress`.
 * @param {string} [props.testID]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]  Solo para ubicarla.
 */
export function Card ({ children, variant = 'elevated', padding = 'lg', onPress, accessibilityLabel, testID, style }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const base = [styles.card, styles[variant], styles[padding]]
  if (!onPress) {
    return <View testID={testID} style={[...base, style]}>{children}</View>
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.ripple }}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  )
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: { gap: spacing.sm, borderRadius: radius.xl, borderCurve: 'continuous', overflow: 'hidden' },
  // En claro la separación es la sombra; en oscuro (sin sombra), el borde.
  elevated: { backgroundColor: colors.surface, borderWidth: borders.thin, borderColor: shadows.card ? 'transparent' : colors.border, boxShadow: shadows.card },
  outlined: { backgroundColor: colors.surface, borderWidth: borders.thin, borderColor: colors.border },
  tinted: { backgroundColor: colors.primarySoft },
  md: { padding: spacing.md },
  lg: { padding: spacing.lg },
  pressed: { opacity: 0.9, transform: [{ scale: motion.pressScale }] }
}))
