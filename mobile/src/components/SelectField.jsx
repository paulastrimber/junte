import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { OTHER, OTHER_LABEL, labelFor, normalizeText } from '../utils/catalog.js'

// Con pocas opciones no hace falta buscador.
const SEARCH_FROM = 8

/**
 * Selector de una opción de una lista (universidad, carrera, ciudad, barrio): un campo que abre una lista con buscador.
 * La opción "Otra" (key `other`, sin texto libre) se agrega al final. Presentacional: no conoce el catálogo ni la API.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value  Key elegida, `other` o '' si no hay.
 * @param {Array<{ key: string, label: string, group?: string }>} props.options
 * @param {(key: string) => void} props.onChange
 * @param {boolean} [props.allowOther]
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]  Texto bajo el campo (p. ej. por qué está deshabilitado).
 * @param {string} [props.error]
 */
export function SelectField ({ label, value, options, onChange, allowOther = true, disabled = false, hint, error }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const all = allowOther ? [...options, { key: OTHER, label: OTHER_LABEL }] : options
    const needle = normalizeText(query).trim()
    if (!needle) return all
    // "Otra" queda siempre a mano, aunque no coincida con lo que se busca.
    return all.filter((option) => option.key === OTHER || normalizeText(`${option.label} ${option.group ?? ''}`).includes(needle))
  }, [options, allowOther, query])

  const hasNoMatches = query.trim() !== '' && items.every((option) => option.key === OTHER)
  const selectedLabel = labelFor(options, value)

  function open () {
    setQuery('')
    setIsOpen(true)
  }

  function choose (key) {
    setIsOpen(false)
    if (key !== value) onChange(key)
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityHint='Abre la lista de opciones'
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={open}
        style={[styles.input, error && styles.inputError, disabled && styles.inputDisabled]}
      >
        <Text style={selectedLabel ? styles.value : styles.placeholder}>{selectedLabel || 'Elegir'}</Text>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error} accessibilityRole='alert'>{error}</Text> : null}

      <Modal visible={isOpen} animationType='slide' onRequestClose={() => setIsOpen(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle} accessibilityRole='header'>{label}</Text>
          {options.length >= SEARCH_FROM
            ? (
              <TextInput
                accessibilityLabel={`Buscar ${label.toLowerCase()}`}
                style={styles.search}
                placeholder='Buscar'
                placeholderTextColor='#888'
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              )
            : null}
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps='handled'
            ListHeaderComponent={hasNoMatches ? <Text style={styles.empty}>No encontramos coincidencias.</Text> : null}
            ListEmptyComponent={<Text style={styles.empty}>No encontramos coincidencias.</Text>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={item.label}
                accessibilityState={{ selected: item.key === value }}
                onPress={() => choose(item.key)}
                style={[styles.row, item.key === value && styles.rowSelected]}
              >
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.group ? <Text style={styles.rowGroup}>{item.group}</Text> : null}
              </Pressable>
            )}
          />
          <Pressable accessibilityRole='button' accessibilityLabel='Cerrar' onPress={() => setIsOpen(false)} style={styles.close}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#222' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  inputError: { borderColor: '#b42318' },
  inputDisabled: { backgroundColor: '#f2f2f2' },
  value: { fontSize: 16, color: '#222' },
  placeholder: { fontSize: 16, color: '#888' },
  hint: { fontSize: 12, color: '#666' },
  error: { color: '#b42318', fontSize: 13 },
  modal: { flex: 1, padding: 16, paddingTop: 48, gap: 12, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  search: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  rowSelected: { backgroundColor: '#e8efff' },
  rowLabel: { fontSize: 16, color: '#222' },
  rowGroup: { fontSize: 12, color: '#666' },
  empty: { textAlign: 'center', color: '#666', paddingVertical: 24 },
  close: { alignItems: 'center', paddingVertical: 12 },
  closeText: { color: '#1f4fd1', fontWeight: '600', fontSize: 16 }
})
