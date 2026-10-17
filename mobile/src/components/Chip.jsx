import { Pressable } from 'react-native'

import { borders, createThemedStyles, motion, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { selectionFeedback } from './haptics.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Mide 40 de alto: el área táctil se completa hasta 48 por fuera.
const HIT_SLOP = Object.freeze({ top: (sizes.touch - sizes.touchSmall) / 2, bottom: (sizes.touch - sizes.touchSmall) / 2 })

/**
 * Una opción que se marca y se desmarca (filtro, interés, sección). El estado no depende solo del color: la
 * opción marcada de un `checkbox` lleva una tilde. Lo usan `ChipGroup` e `InterestPicker`.
 * @param {object} props
 * @param {string} props.label  Texto visible y nombre accesible.
 * @param {boolean} props.selected
 * @param {() => void} props.onPress
 * @param {'checkbox' | 'radio'} [props.role]  `checkbox`: se pueden marcar varias; `radio`: una sola del grupo.
 * @param {boolean} [props.disabled]
 * @param {string} [props.icon]  Nombre de Ionicons, antes del texto (se reemplaza por la tilde si está marcada).
 */
export function Chip ({ label, selected, onPress, role = 'checkbox', disabled = false, icon }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const leading = selected && role === 'checkbox' ? 'checkmark' : icon
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      android_ripple={{ color: colors.ripple }}
      onPress={() => {
        selectionFeedback()
        onPress()
      }}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {leading ? <Icon name={leading} size={sizes.iconSm} color={selected ? 'onPrimary' : 'textMuted'} /> : null}
      <Text variant='label' color={selected ? 'onPrimary' : 'text'}>{label}</Text>
    </Pressable>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.touchSmall,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: borders.thick,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: 0.4 }
}))
