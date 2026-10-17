import { useState } from 'react'
import { TextInput, View } from 'react-native'

import { borders, createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Campo de texto con etiqueta y error. Presentacional: no conoce validaciones ni la API.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {string} [props.icon]  Nombre de Ionicons; va dentro del campo, a la izquierda.
 * @param {string} [props.hint]  Ayuda bajo el campo ("Lo ven quienes se anotan"). Si hay error, se muestra el error.
 */
export function FormField ({ label, error, icon, hint, onFocus, onBlur, multiline, style, ...inputProps }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [isFocused, setIsFocused] = useState(false)
  return (
    <View style={styles.field}>
      <Text variant='label'>{label}</Text>
      <View style={[styles.box, isFocused && styles.boxFocused, error && styles.boxError]}>
        {icon ? <Icon name={icon} color={isFocused ? 'primary' : 'textMuted'} /> : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          style={[styles.input, multiline && styles.multiline, style]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          multiline={multiline}
          onFocus={(event) => { setIsFocused(true); onFocus?.(event) }}
          onBlur={(event) => { setIsFocused(false); onBlur?.(event) }}
          {...inputProps}
        />
      </View>
      {error
        ? (
          <View style={styles.errorRow}>
            <Icon name='alert-circle-outline' size={sizes.iconSm} color='danger' />
            <Text variant='caption' color='danger' accessibilityRole='alert' style={styles.errorText}>{error}</Text>
          </View>
          )
        : hint ? <Text variant='caption' color='textMuted'>{hint}</Text> : null}
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
    borderWidth: borders.thick,
    // Borde de control (3:1 contra el fondo): el campo tiene que verse aunque esté vacío.
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface
  },
  // El foco no depende solo del color del borde: suma un halo violeta por fuera (sin mover el contenido).
  boxFocused: { borderColor: colors.primary, boxShadow: `0 0 0 3px ${colors.ripple}` },
  boxError: { borderColor: colors.danger },
  // Sin `lineHeight`: en iOS desalinea el texto de un TextInput de una línea.
  input: { flex: 1, paddingVertical: spacing.md, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, color: colors.text },
  multiline: { minHeight: sizes.textArea, textAlignVertical: 'top' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1 }
}))
