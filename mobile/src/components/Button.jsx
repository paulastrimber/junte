import { ActivityIndicator, Pressable } from 'react-native'

import { borders, createThemedStyles, motion, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { tapFeedback } from './haptics.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Color del texto, del ícono y del indicador de carga de cada variante (rol del tema).
const CONTENT_COLOR = Object.freeze({ primary: 'onPrimary', secondary: 'primary', ghost: 'primary', danger: 'danger' })

// El botón `sm` mide 40: el área táctil se completa hasta 48 por fuera, sin agrandar el dibujo.
const SMALL_HIT_SLOP = Object.freeze({ top: (sizes.touch - sizes.touchSmall) / 2, bottom: (sizes.touch - sizes.touchSmall) / 2 })

/**
 * Botón de la app. Una pantalla tiene, como mucho, un `primary` a la vista: es "lo que hay que hacer acá".
 * @param {object} props
 * @param {string} props.title
 * @param {() => void} props.onPress
 * @param {boolean} [props.loading]  Muestra un indicador y deshabilita el botón.
 * @param {boolean} [props.disabled]
 * @param {'primary' | 'secondary' | 'ghost' | 'danger'} [props.variant]  `ghost`: acción terciaria, solo texto.
 * @param {'md' | 'sm'} [props.size]
 * @param {string} [props.icon]  Nombre de Ionicons; va antes del texto.
 * @param {boolean} [props.haptic]  Vibración corta al tocar (iOS). Solo para la acción principal de la pantalla.
 * @param {string} [props.accessibilityLabel]  Si el texto visible no alcanza ("Filtros (2)" → "Filtros, 2 activos").
 * @param {string} [props.accessibilityHint]  Qué pasa al tocarlo, si no es obvio.
 * @param {string} [props.testID]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]  Solo para ubicarlo (margen, flex).
 */
export function Button ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  icon,
  haptic = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style
}) {
  const styles = useStyles()
  const { colors } = useTheme()
  const isDisabled = disabled || loading
  const contentColor = CONTENT_COLOR[variant]
  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? SMALL_HIT_SLOP : undefined}
      android_ripple={variant === 'primary' ? undefined : { color: colors.ripple }}
      // No devuelve lo que devuelva `onPress`: los manejadores async (envíos de formularios) atrapan sus propios errores.
      onPress={() => {
        if (haptic) tapFeedback()
        onPress()
      }}
      style={({ pressed }) => [styles.button, styles[size], styles[variant], pressed && styles.pressed, isDisabled && styles.disabled, style]}
    >
      {loading
        ? <ActivityIndicator color={colors[contentColor]} />
        : (
          <>
            {icon ? <Icon name={icon} color={contentColor} size={size === 'sm' ? sizes.iconSm : sizes.iconMd} /> : null}
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
    borderWidth: borders.thick,
    borderColor: 'transparent',
    // La onda de Android no se sale de las esquinas redondeadas.
    overflow: 'hidden'
  },
  // `minHeight` (no `height`): con texto grande del sistema el botón crece en lugar de cortar el texto.
  md: { minHeight: sizes.touch },
  sm: { minHeight: sizes.touchSmall, paddingHorizontal: spacing.lg },
  primary: { backgroundColor: colors.primary },
  // El borde del secundario es el de un control (3:1), no el de una tarjeta: tiene que leerse como botón.
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerSoft },
  // Apretar es instantáneo y físico: se achica un poco y baja la opacidad.
  pressed: { opacity: 0.85, transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: 0.45 }
}))
