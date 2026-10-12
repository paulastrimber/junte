import { useState } from 'react'
import { TextInput, View } from 'react-native'

import { createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Campo de texto con etiqueta y error. Presentacional: no conoce validaciones ni la API.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {string} [props.icon]  Nombre de Ionicons; va dentro del campo, a la izquierda.
 */
export function FormField ({ label, error, icon, onFocus, onBlur, multiline, style, ...inputProps }) {
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
        : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  field: { gap: spacing.xs + 2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: sizes.input,
    paddingHorizontal: spacing.md + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface
  },
  boxFocused: { borderColor: colors.primary },
  boxError: { borderColor: colors.danger },
  // Sin `lineHeight`: en iOS desalinea el texto de un TextInput de una línea.
  input: { flex: 1, paddingVertical: spacing.md, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, color: colors.text },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  errorText: { flex: 1 }
}))
