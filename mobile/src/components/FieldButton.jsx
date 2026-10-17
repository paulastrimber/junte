import { Pressable, View } from 'react-native'

import { borders, createThemedStyles, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Campo que se elige en lugar de escribirse (fecha, universidad, barrio): se ve como un `FormField` y abre un
 * selector. Su nombre accesible es la etiqueta y el valor elegido va como `accessibilityValue`, así el lector de
 * pantalla dice "Universidad, botón, ORT". Lo usan `DateField`, `DateTimeField` y `SelectField`.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.value]  Texto del valor elegido; vacío muestra `placeholder`.
 * @param {string} props.placeholder  "Elegir", "Elegir fecha".
 * @param {() => void} props.onPress
 * @param {string} [props.accessibilityHint]  Qué abre ("Abre el selector de fecha").
 * @param {string} [props.icon]  Nombre de Ionicons a la izquierda.
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]  Texto bajo el campo (p. ej. por qué está deshabilitado).
 * @param {string} [props.error]
 * @param {import('react').ReactNode} [props.children]  Lo que se despliega debajo (el selector en línea de iOS).
 */
export function FieldButton ({ label, value, placeholder, onPress, accessibilityHint, icon, disabled = false, hint, error, children }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <View style={styles.field}>
      <Text variant='label'>{label}</Text>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityValue={value ? { text: value } : undefined}
        accessibilityState={{ disabled }}
        disabled={disabled}
        android_ripple={{ color: colors.ripple }}
        onPress={onPress}
        style={({ pressed }) => [styles.box, error && styles.boxError, pressed && styles.pressed, disabled && styles.disabled]}
      >
        {icon ? <Icon name={icon} color='textMuted' /> : null}
        <Text color={value ? 'text' : 'textMuted'} style={styles.value} numberOfLines={2}>{value || placeholder}</Text>
        <Icon name='chevron-down' size={sizes.iconSm} color='textMuted' />
      </Pressable>
      {children}
      {hint ? <Text variant='caption' color='textMuted'>{hint}</Text> : null}
      {error
        ? (
          <View style={styles.errorRow}>
            <Icon name='alert-circle-outline' size={sizes.iconSm} color='danger' />
            <Text variant='caption' color='danger' accessibilityRole='alert' style={styles.errorText}>{error}</Text>
          </View>
          )
        : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  field: { gap: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: borders.thick,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  boxError: { borderColor: colors.danger },
  pressed: { borderColor: colors.primary },
  disabled: { backgroundColor: colors.surfaceAlt, opacity: 0.6 },
  value: { flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1 }
}))
