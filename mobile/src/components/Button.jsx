import { ActivityIndicator, Pressable } from 'react-native'

import { createThemedStyles, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Color del texto, del ícono y del indicador de carga de cada variante (rol del tema).
const CONTENT_COLOR = Object.freeze({ primary: 'onPrimary', secondary: 'primary', ghost: 'primary', danger: 'danger' })

/**
 * @param {object} props
 * @param {string} props.title
 * @param {() => void} props.onPress
 * @param {boolean} [props.loading]  Muestra un indicador y deshabilita el botón.
 * @param {boolean} [props.disabled]
 * @param {'primary' | 'secondary' | 'ghost' | 'danger'} [props.variant]  `ghost`: acción terciaria, solo texto.
 * @param {'md' | 'sm'} [props.size]
 * @param {string} [props.icon]  Nombre de Ionicons; va antes del texto.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]  Solo para ubicarlo (margen, flex).
 */
export function Button ({ title, onPress, loading = false, disabled = false, variant = 'primary', size = 'md', icon, style }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const isDisabled = disabled || loading
  const contentColor = CONTENT_COLOR[variant]
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      // No devuelve lo que devuelva `onPress`: los manejadores async (envíos de formularios) atrapan sus propios errores.
      onPress={() => { onPress() }}
      style={({ pressed }) => [styles.button, styles[size], styles[variant], pressed && styles.pressed, isDisabled && styles.disabled, style]}
    >
      {loading
        ? <ActivityIndicator color={colors[contentColor]} />
        : (
          <>
            {icon ? <Icon name={icon} color={contentColor} /> : null}
            <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} color={contentColor} center>{title}</Text>
          </>
          )}
    </Pressable>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: 'transparent'
  },
  // `minHeight` (no `height`): con texto grande del sistema el botón crece en lugar de cortar el texto.
  md: { minHeight: sizes.touch },
  sm: { minHeight: sizes.touchSmall, paddingHorizontal: spacing.lg },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerSoft },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 }
}))
