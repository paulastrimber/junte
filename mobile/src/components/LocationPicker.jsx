import { View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

import { borders, createThemedStyles, radius, sizes, spacing, useTheme } from '../theme/index.js'
import { Button } from './Button.jsx'
import { FormField } from './FormField.jsx'
import { Icon } from './Icon.jsx'
import { Notice } from './Notice.jsx'
import { Text } from './Text.jsx'

export const TEXTS = Object.freeze({
  address: 'Buscar una dirección',
  addressPlaceholder: 'Calle, número y ciudad',
  search: 'Buscar',
  myLocation: 'Usar mi ubicación',
  map: 'Mapa para elegir el lugar del plan',
  pin: 'Lugar del plan',
  hint: 'Mantené apretado el pin y arrastralo para ajustar el punto exacto.',
  empty: 'Buscá una dirección o usá tu ubicación para ubicar el pin.'
})

// Centro de Montevideo: lo que muestra el mapa mientras no hay un punto elegido.
const DEFAULT_CENTER = Object.freeze({ latitude: -34.9011, longitude: -56.1645 })
const ZOOM_WITH_PIN = Object.freeze({ latitudeDelta: 0.01, longitudeDelta: 0.01 })
const ZOOM_CITY = Object.freeze({ latitudeDelta: 0.12, longitudeDelta: 0.12 })

/**
 * Selector del lugar de un plan: buscador de dirección, "usar mi ubicación" y un mapa con un pin arrastrable.
 * Presentacional: buscar y ubicar lo resuelve el hook (`usePlacePicker`). Hacia afuera las coordenadas son
 * SIEMPRE GeoJSON `[lng, lat]`; el mapa trabaja con `{ latitude, longitude }` y se convierte acá.
 * @param {object} props
 * @param {[number, number] | null} props.coordinates
 * @param {(coordinates: [number, number]) => void} props.onChange
 * @param {string} props.address
 * @param {(text: string) => void} props.onAddressChange
 * @param {() => void} props.onSearch
 * @param {() => void} props.onUseMyLocation
 * @param {boolean} [props.isWorking]
 * @param {string | null} [props.message]  Aviso de la búsqueda (dirección no encontrada, sin permiso).
 * @param {string} [props.error]  Error de validación del formulario.
 */
export function LocationPicker ({ coordinates, onChange, address, onAddressChange, onSearch, onUseMyLocation, isWorking = false, message, error }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const pin = coordinates ? { latitude: coordinates[1], longitude: coordinates[0] } : null
  const region = pin ? { ...pin, ...ZOOM_WITH_PIN } : { ...DEFAULT_CENTER, ...ZOOM_CITY }
  const moveTo = ({ latitude, longitude }) => onChange([longitude, latitude])

  return (
    <View style={styles.container}>
      <FormField
        label={TEXTS.address}
        icon='search-outline'
        placeholder={TEXTS.addressPlaceholder}
        value={address}
        onChangeText={onAddressChange}
        onSubmitEditing={onSearch}
        returnKeyType='search'
        editable={!isWorking}
      />
      <View style={styles.actions}>
        <Button title={TEXTS.search} variant='secondary' size='sm' loading={isWorking} onPress={onSearch} style={styles.action} />
        <Button title={TEXTS.myLocation} variant='secondary' size='sm' icon='navigate-outline' disabled={isWorking} onPress={onUseMyLocation} style={styles.action} />
      </View>
      {message ? <Notice tone='warning' message={message} accessibilityRole='alert' /> : null}

      {/* El recorte va en un contenedor: el mapa nativo no siempre respeta su propio `borderRadius`. */}
      <View style={[styles.mapFrame, error && styles.mapFrameError]}>
        <MapView
          testID='location-map'
          accessibilityLabel={TEXTS.map}
          style={styles.map}
          region={region}
          onPress={(event) => moveTo(event.nativeEvent.coordinate)}
        >
          {pin
            ? <Marker testID='location-pin' coordinate={pin} title={TEXTS.pin} pinColor={colors.primary} draggable onDragEnd={(event) => moveTo(event.nativeEvent.coordinate)} />
            : null}
        </MapView>
      </View>
      <Text variant='caption' color='textMuted'>{pin ? TEXTS.hint : TEXTS.empty}</Text>
      {error
        ? (
          <View style={styles.errorRow}>
            <Icon name='alert-circle-outline' size={sizes.iconSm} color='danger' />
            <Text variant='caption' color='danger' accessibilityRole='alert' style={styles.errorText}>{error}</Text>
          </View>
          )
        : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  container: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  mapFrame: { height: sizes.map, borderRadius: radius.xl, borderCurve: 'continuous', overflow: 'hidden', borderWidth: borders.thin, borderColor: colors.border },
  mapFrameError: { borderColor: colors.danger, borderWidth: borders.thick },
  map: { flex: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1 }
}))
