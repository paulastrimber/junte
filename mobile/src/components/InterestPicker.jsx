import { Pressable, StyleSheet, Text, View } from 'react-native'

import { MAX_INTERESTS } from '../utils/catalog.js'

/**
 * Intereses agrupados por categoría (hobbies). Elige hasta MAX_INTERESTS; al llegar al máximo, el resto se deshabilita.
 * @param {object} props
 * @param {Array<{ key: string, name: string, interests: Array<{ key: string, name: string }> }>} props.categories  Ya filtradas por edad.
 * @param {string[]} props.selected
 * @param {(key: string) => void} props.onToggle
 */
export function InterestPicker ({ categories, selected, onToggle }) {
  const isFull = selected.length >= MAX_INTERESTS
  return (
    <View style={styles.container}>
      {categories.map((category) => (
        <View key={category.key} style={styles.category}>
          <Text style={styles.categoryName} accessibilityRole='header'>{category.name}</Text>
          <View style={styles.row}>
            {category.interests.map(({ key, name }) => {
              const isSelected = selected.includes(key)
              const isDisabled = isFull && !isSelected
              return (
                <Pressable
                  key={key}
                  accessibilityRole='checkbox'
                  accessibilityLabel={name}
                  accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                  disabled={isDisabled}
                  onPress={() => onToggle(key)}
                  style={[styles.chip, isSelected && styles.chipSelected, isDisabled && styles.chipDisabled]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{name}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  category: { gap: 8 },
  categoryName: { fontSize: 15, fontWeight: '600', color: '#222' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1f4fd1', borderColor: '#1f4fd1' },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: '#222' },
  chipTextSelected: { color: '#fff', fontWeight: '600' }
})
