import { useContext, useMemo, useState } from 'react'
import { FlatList, Modal, Platform, Pressable, TextInput, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'

import { borders, createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'
import { OTHER, OTHER_LABEL, labelFor, normalizeText } from '../utils/catalog.js'
import { Button } from './Button.jsx'
import { FieldButton } from './FieldButton.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

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
  const styles = useStyles()
  const { colors } = useTheme()
  // Fuera de un navegador (tests de un componente suelto) no hay proveedor de áreas seguras.
  const insets = useContext(SafeAreaInsetsContext)
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
    <FieldButton
      label={label}
      value={selectedLabel}
      placeholder='Elegir'
      accessibilityHint='Abre la lista de opciones'
      disabled={disabled}
      onPress={open}
      hint={hint}
      error={error}
    >
      <Modal
        visible={isOpen}
        animationType='slide'
        // En iOS, hoja nativa que deja ver la pantalla de atrás; en Android, pantalla completa.
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={[styles.modal, { paddingTop: Platform.OS === 'ios' ? spacing.lg : spacing.lg + (insets?.top ?? 0) }]}>
          <View style={styles.modalHeader}>
            <Text variant='title' accessibilityRole='header' style={styles.modalTitle}>{label}</Text>
            <Button title='Cerrar' variant='ghost' size='sm' onPress={() => setIsOpen(false)} />
          </View>
          {options.length >= SEARCH_FROM
            ? (
              <View style={styles.search}>
                <Icon name='search-outline' color='textMuted' />
                <TextInput
                  accessibilityLabel={`Buscar ${label.toLowerCase()}`}
                  style={styles.searchInput}
                  placeholder='Buscar'
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.primary}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                />
              </View>
              )
            : null}
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{ paddingBottom: spacing.xl + (insets?.bottom ?? 0) }}
            ListHeaderComponent={hasNoMatches ? <Text color='textMuted' center style={styles.empty}>No encontramos coincidencias.</Text> : null}
            ListEmptyComponent={<Text color='textMuted' center style={styles.empty}>No encontramos coincidencias.</Text>}
            renderItem={({ item }) => {
              const isSelected = item.key === value
              return (
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isSelected }}
                  android_ripple={{ color: colors.ripple }}
                  onPress={() => choose(item.key)}
                  style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowText}>
                    <Text color={isSelected ? 'onPrimarySoft' : 'text'} variant={isSelected ? 'bodyStrong' : 'body'}>{item.label}</Text>
                    {item.group ? <Text variant='caption' color={isSelected ? 'onPrimarySoft' : 'textMuted'}>{item.group}</Text> : null}
                  </View>
                  {isSelected ? <Icon name='checkmark' color='onPrimarySoft' /> : null}
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </FieldButton>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  modal: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modalTitle: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.input,
    paddingHorizontal: spacing.md,
    borderWidth: borders.thick,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface
  },
  // Sin `lineHeight`: en iOS desalinea el texto de un TextInput de una línea.
  searchInput: { flex: 1, paddingVertical: spacing.md, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: sizes.touch,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden'
  },
  rowText: { flex: 1, gap: spacing.xxs },
  rowSelected: { backgroundColor: colors.primarySoft },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  empty: { paddingVertical: spacing.xl }
}))
