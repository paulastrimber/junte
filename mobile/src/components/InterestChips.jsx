import { Pressable, StyleSheet, Text, View } from 'react-native'

import { INTERESTS, MAX_INTERESTS } from '../utils/interests.js'

/**
 * Selector de intereses de la lista cerrada, con máximo.
 * @param {object} props
 * @param {string[]} props.selected
 * @param {(id: string) => void} props.onToggle
 */
export function InterestChips ({ selected, onToggle }) {
  const isFull = selected.length >= MAX_INTERESTS
  return (
    <View style={styles.row}>
      {INTERESTS.map(({ id, label }) => {
        const isSelected = selected.includes(id)
        const isDisabled = isFull && !isSelected
        return (
          <Pressable
            key={id}
            accessibilityRole='checkbox'
            accessibilityLabel={label}
            accessibilityState={{ checked: isSelected, disabled: isDisabled }}
            disabled={isDisabled}
            onPress={() => onToggle(id)}
            style={[styles.chip, isSelected && styles.chipSelected, isDisabled && styles.chipDisabled]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1f4fd1', borderColor: '#1f4fd1' },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: '#222' },
  chipTextSelected: { color: '#fff', fontWeight: '600' }
})
