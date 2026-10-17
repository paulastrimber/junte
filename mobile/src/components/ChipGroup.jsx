import { Pressable, View } from 'react-native'

import { borders, createThemedStyles, motion, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { Chip } from './Chip.jsx'
import { selectionFeedback } from './haptics.js'
import { Text } from './Text.jsx'

/**
 * Grupo de opciones como chips. Con `multiple` se pueden marcar varias (checkbox); si no, una sola (radio).
 * Presentacional: no sabe qué significan las opciones.
 * @param {object} props
 * @param {string} props.label  Título del grupo (también nombre accesible).
 * @param {Array<{ key: string | number, label: string }>} props.options
 * @param {Array<string | number>} props.selected  Keys marcadas (una sola si no es `multiple`).
 * @param {(key: string | number) => void} props.onSelect
 * @param {boolean} [props.multiple]
 * @param {'chips' | 'segmented'} [props.variant]  `segmented`: 2 o 3 opciones excluyentes que cambian la vista
 *   entera ("Con cupo / Llenos", "Voy / Organizo"). Ocupa todo el ancho; no sirve con `multiple`.
 * @param {boolean} [props.hideLabel]  No muestra el título (sigue siendo el nombre accesible del grupo).
 */
export function ChipGroup ({ label, options, selected, onSelect, multiple = false, variant = 'chips', hideLabel = false }) {
  const styles = useStyles()
  const isSegmented = variant === 'segmented' && !multiple
  return (
    <View style={styles.group} accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
      {hideLabel ? null : <Text variant='label' color='textMuted' accessibilityRole='header'>{label}</Text>}
      {isSegmented
        ? <Segmented options={options} selected={selected} onSelect={onSelect} />
        : (
          <View style={styles.row}>
            {options.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                role={multiple ? 'checkbox' : 'radio'}
                selected={selected.includes(option.key)}
                onPress={() => onSelect(option.key)}
              />
            ))}
          </View>
          )}
    </View>
  )
}

/** Control segmentado: una pista con las opciones y la elegida "levantada". */
function Segmented ({ options, selected, onSelect }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const isSelected = selected.includes(option.key)
        return (
          <Pressable
            key={option.key}
            accessibilityRole='radio'
            accessibilityLabel={option.label}
            accessibilityState={{ checked: isSelected }}
            android_ripple={{ color: colors.ripple }}
            onPress={() => {
              selectionFeedback()
              onSelect(option.key)
            }}
            style={({ pressed }) => [styles.segment, isSelected && styles.segmentSelected, pressed && styles.pressed]}
          >
            <Text variant='label' color={isSelected ? 'primary' : 'textMuted'} center numberOfLines={1}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  track: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: colors.surfaceAlt },
  segment: {
    flex: 1,
    minHeight: sizes.touchSmall,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: borders.thin,
    borderColor: 'transparent',
    overflow: 'hidden'
  },
  // En modo oscuro no hay sombra: el borde es lo que separa el segmento elegido de la pista.
  segmentSelected: { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.raised },
  pressed: { transform: [{ scale: motion.pressScale }] }
}))
