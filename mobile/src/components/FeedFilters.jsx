import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'

import { DATE_PRESETS, RADIUS_OPTIONS_KM, priceRangeLabel, radiusLabel } from '../utils/plans.js'
import { Button } from './Button.jsx'
import { ChipGroup } from './ChipGroup.jsx'
import { InterestPicker } from './InterestPicker.jsx'

export const TEXTS = Object.freeze({
  title: 'Filtros',
  radius: 'Distancia máxima',
  radiusHint: 'Se usa cuando el feed puede usar tu ubicación.',
  date: 'Fecha',
  price: 'Costo',
  interests: 'Tipo de actividad',
  apply: 'Ver planes',
  reset: 'Limpiar filtros'
})

const RADIUS_CHOICES = RADIUS_OPTIONS_KM.map((km) => ({ key: km, label: radiusLabel(km) }))

/**
 * Panel de filtros del feed. Todos son predefinidos: se eligen valores, nunca se escribe una consulta.
 * Presentacional: el estado vive en `useFeedFilters` y los cambios se aplican al instante.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {{ radiusKm: number, datePreset: string, interests: string[], priceRanges: string[] }} props.values
 * @param {Array<{ key: string, min: number, max: number | null }>} props.priceRangeOptions  Los define el back.
 * @param {Array<{ key: string, name: string, interests: Array<{ key: string, name: string }> }>} props.interestCategories
 * @param {(field: string, value: unknown) => void} props.onChange
 * @param {(key: string) => void} props.onToggleInterest
 * @param {(key: string) => void} props.onTogglePriceRange
 * @param {() => void} props.onReset
 */
export function FeedFilters ({ visible, onClose, values, priceRangeOptions, interestCategories, onChange, onToggleInterest, onTogglePriceRange, onReset }) {
  const priceChoices = priceRangeOptions.map((range) => ({ key: range.key, label: priceRangeLabel(range) }))
  return (
    <Modal visible={visible} animationType='slide' onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title} accessibilityRole='header'>{TEXTS.title}</Text>

          <ChipGroup label={TEXTS.radius} options={RADIUS_CHOICES} selected={[values.radiusKm]} onSelect={(km) => onChange('radiusKm', km)} />
          <Text style={styles.hint}>{TEXTS.radiusHint}</Text>

          <ChipGroup label={TEXTS.date} options={DATE_PRESETS} selected={[values.datePreset]} onSelect={(key) => onChange('datePreset', key)} />

          {priceChoices.length > 0
            ? <ChipGroup label={TEXTS.price} options={priceChoices} selected={values.priceRanges} onSelect={onTogglePriceRange} multiple />
            : null}

          {interestCategories.length > 0
            ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel} accessibilityRole='header'>{TEXTS.interests}</Text>
                <InterestPicker categories={interestCategories} selected={values.interests} onToggle={onToggleInterest} />
              </View>
              )
            : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={TEXTS.reset} variant='secondary' onPress={onReset} />
          <Button title={TEXTS.apply} onPress={onClose} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#222' },
  hint: { fontSize: 12, color: '#666', marginTop: -12 },
  section: { gap: 12 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#222' },
  footer: { padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#eee' }
})
