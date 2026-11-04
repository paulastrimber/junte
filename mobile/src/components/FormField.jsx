import { useState } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'

import { borders, createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/** Se suma a la ayuda de los campos obligatorios: el lector no lee el asterisco. */
export const REQUIRED_HINT = 'Obligatorio'

export const PASSWORD_TOGGLE = Object.freeze({ show: 'Mostrar contraseña', hide: 'Ocultar contraseña' })

// Con la contraseña a la vista, el teclado no tiene que sugerirla ni aprenderla.
const REVEALED_INPUT_PROPS = Object.freeze({
  autoCorrect: false,
  spellCheck: false,
  ...(Platform.OS === 'android' ? { keyboardType: 'visible-password' } : null)
})

/**
 * Campo de texto con etiqueta y error. Presentacional: no conoce validaciones ni la API.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {string} [props.icon]  Nombre de Ionicons; va dentro del campo, a la izquierda.
 * @param {string} [props.hint]  Ayuda bajo el campo ("Lo ven quienes se anotan"). Si hay error, se muestra el error.
 * @param {boolean} [props.required]  Muestra un asterisco junto a la etiqueta y dice "Obligatorio" al lector.
 * @param {boolean} [props.secureTextEntry]  Oculta el texto y suma un botón con un ojo para mostrarlo.
 */
export function FormField ({ label, error, icon, hint, required = false, secureTextEntry, onFocus, onBlur, multiline, style, ...inputProps }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [isFocused, setIsFocused] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  return (
    <View style={styles.field}>
      {required ? <RequiredLabel label={label} /> : <Text variant='label'>{label}</Text>}
      <View style={[styles.box, isFocused && styles.boxFocused, error && styles.boxError]}>
        {icon ? <Icon name={icon} color={isFocused ? 'primary' : 'textMuted'} /> : null}
        <TextInput
          accessibilityLabel={label}
          // Con error, el lector lo anuncia junto con el campo (la ayuda no se ve mientras hay error).
          accessibilityHint={required ? [REQUIRED_HINT, error || hint].filter(Boolean).join('. ') : error || hint}
          style={[styles.input, multiline && styles.multiline, style]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          multiline={multiline}
          onFocus={(event) => { setIsFocused(true); onFocus?.(event) }}
          onBlur={(event) => { setIsFocused(false); onBlur?.(event) }}
          secureTextEntry={secureTextEntry && !isRevealed}
          {...inputProps}
          {...(isRevealed ? REVEALED_INPUT_PROPS : null)}
        />
        {secureTextEntry
          ? (
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={isRevealed ? PASSWORD_TOGGLE.hide : PASSWORD_TOGGLE.show}
              hitSlop={spacing.xs}
              onPress={() => setIsRevealed((current) => !current)}
              style={styles.toggle}
            >
              <Icon name={isRevealed ? 'eye-off-outline' : 'eye-outline'} color='textMuted' />
            </Pressable>
            )
          : null}
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

/**
 * Etiqueta con asterisco. El asterisco es un `Text` hermano (no anidado) para poder ocultarlo al lector: en iOS un
 * `Text` anidado es parte del mismo elemento accesible. La etiqueta en sí no lleva `accessibilityLabel`, así el campo
 * sigue siendo el único elemento con ese nombre.
 * @param {{ label: string }} props
 */
export function RequiredLabel ({ label }) {
  return (
    <View style={labelStyles.row}>
      <Text variant='label'>{label}</Text>
      <Text variant='label' color='danger' aria-hidden>{' *'}</Text>
    </View>
  )
}

const labelStyles = { row: { flexDirection: 'row', flexWrap: 'wrap' } }

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
  // Pegado al borde derecho del campo: el área táctil se come el padding y el gap, y el ojo queda alineado.
  toggle: { width: sizes.touch, minHeight: sizes.touchSmall, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm, marginRight: -spacing.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1 }
}))
