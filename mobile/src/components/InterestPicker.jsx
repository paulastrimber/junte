import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { spacing } from '../theme/index.js'
import { MAX_INTERESTS } from '../utils/catalog.js'
import { Chip } from './Chip.jsx'
import { Text } from './Text.jsx'

/**
 * Intereses agrupados por categoría (hobbies). Elige hasta MAX_INTERESTS; al llegar al máximo, el resto se deshabilita.
 * @param {object} props
 * @param {Array<{ key: string, name: string, interests: Array<{ key: string, name: string }> }>} props.categories  Ya filtradas por edad.
 * @param {string[]} props.selected
 * @param {(key: string) => void} props.onToggle
 */
export const InterestPicker = memo(function InterestPicker ({ categories, selected, onToggle }) {
  const isFull = selected.length >= MAX_INTERESTS
  const selectedSet = useMemo(() => new Set(selected), [selected])
  return (
    <View style={styles.container}>
      {categories.map((category) => (
        <View key={category.key} style={styles.category}>
          <Text variant='label' color='textMuted' accessibilityRole='header'>{category.name}</Text>
          <View style={styles.row}>
            {category.interests.map(({ key, name }) => {
              const isSelected = selectedSet.has(key)
              return (
                <Chip
                  key={key}
                  label={name}
                  value={key}
                  selected={isSelected}
                  disabled={isFull && !isSelected}
                  // `onToggle` estable (del hook) + `value`: tocar un interés vuelve a pintar solo ese chip.
                  onPress={onToggle}
                />
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  category: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }
})
