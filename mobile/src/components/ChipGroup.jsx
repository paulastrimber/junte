import { Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * Grupo de opciones como chips. Con `multiple` se pueden marcar varias (checkbox); si no, una sola (radio).
 * Presentacional: no sabe qué significan las opciones.
 * @param {object} props
 * @param {string} props.label  Título del grupo (también nombre accesible).
 * @param {Array<{ key: string | number, label: string }>} props.options
 * @param {Array<string | number>} props.selected  Keys marcadas (una sola si no es `multiple`).
 * @param {(key: string | number) => void} props.onSelect
 * @param {boolean} [props.multiple]
 */
export function ChipGroup ({ label, options, selected, onSelect, multiple = false }) {
  return (
    <View style={styles.group} accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
      <Text style={styles.label} accessibilityRole='header'>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const isSelected = selected.includes(option.key)
          return (
            <Pressable
              key={option.key}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityLabel={option.label}
              accessibilityState={{ checked: isSelected }}
              onPress={() => onSelect(option.key)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#222' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#bbb', backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#1f4fd1', borderColor: '#1f4fd1' },
  chipText: { color: '#222' },
  chipTextSelected: { color: '#fff', fontWeight: '600' }
})
