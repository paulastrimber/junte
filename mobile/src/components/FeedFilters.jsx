import { useContext } from 'react'
import { Modal, Platform, ScrollView, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'

import { borders, createThemedStyles, spacing } from '../theme/index.js'
import { DATE_PRESETS, RADIUS_OPTIONS_KM, priceRangeLabel, radiusLabel } from '../utils/plans.js'
import { Button } from './Button.jsx'
import { ChipGroup } from './ChipGroup.jsx'
import { InterestPicker } from './InterestPicker.jsx'
import { Text } from './Text.jsx'

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
  const styles = useStyles()
  // Fuera de un navegador (tests de un componente suelto) no hay proveedor de áreas seguras.
  const insets = useContext(SafeAreaInsetsContext)
  const isSheet = Platform.OS === 'ios'
  const priceChoices = priceRangeOptions.map((range) => ({ key: range.key, label: priceRangeLabel(range) }))
  return (
    <Modal
      visible={visible}
      animationType='slide'
      // En iOS, hoja nativa (se cierra deslizando hacia abajo); en Android, pantalla completa.
      presentationStyle={isSheet ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: spacing.xl + (isSheet ? 0 : insets?.top ?? 0) }]}>
          <Text variant='title' accessibilityRole='header'>{TEXTS.title}</Text>

          <View style={styles.section}>
            <ChipGroup label={TEXTS.radius} options={RADIUS_CHOICES} selected={[values.radiusKm]} onSelect={(km) => onChange('radiusKm', km)} />
            <Text variant='caption' color='textMuted'>{TEXTS.radiusHint}</Text>
          </View>

          <ChipGroup label={TEXTS.date} options={DATE_PRESETS} selected={[values.datePreset]} onSelect={(key) => onChange('datePreset', key)} />

          {priceChoices.length > 0
            ? <ChipGroup label={TEXTS.price} options={priceChoices} selected={values.priceRanges} onSelect={onTogglePriceRange} multiple />
            : null}

          {interestCategories.length > 0
            ? (
              <View style={styles.section}>
                <Text variant='heading' accessibilityRole='header'>{TEXTS.interests}</Text>
                <InterestPicker categories={interestCategories} selected={values.interests} onToggle={onToggleInterest} />
              </View>
              )
            : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: spacing.lg + (insets?.bottom ?? 0) }]}>
          <Button title={TEXTS.reset} variant='ghost' onPress={onReset} style={styles.footerButton} />
          <Button title={TEXTS.apply} onPress={onClose} style={styles.footerButton} />
        </View>
      </View>
    </Modal>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: borders.thin,
    borderTopColor: colors.border,
    backgroundColor: colors.surface
  },
  footerButton: { flex: 1 }
}))
