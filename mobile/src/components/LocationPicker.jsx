import { StyleSheet, Text, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'

import { Button } from './Button.jsx'
import { FormField } from './FormField.jsx'

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
  const pin = coordinates ? { latitude: coordinates[1], longitude: coordinates[0] } : null
  const region = pin ? { ...pin, ...ZOOM_WITH_PIN } : { ...DEFAULT_CENTER, ...ZOOM_CITY }
  const moveTo = ({ latitude, longitude }) => onChange([longitude, latitude])

  return (
    <View style={styles.container}>
      <FormField
        label={TEXTS.address}
        placeholder={TEXTS.addressPlaceholder}
        value={address}
        onChangeText={onAddressChange}
        onSubmitEditing={onSearch}
        returnKeyType='search'
        editable={!isWorking}
      />
      <View style={styles.actions}>
        <View style={styles.action}><Button title={TEXTS.search} variant='secondary' loading={isWorking} onPress={onSearch} /></View>
        <View style={styles.action}><Button title={TEXTS.myLocation} variant='secondary' disabled={isWorking} onPress={onUseMyLocation} /></View>
      </View>
      {message ? <Text style={styles.message} accessibilityRole='alert'>{message}</Text> : null}

      <MapView
        testID='location-map'
        accessibilityLabel={TEXTS.map}
        style={styles.map}
        region={region}
        onPress={(event) => moveTo(event.nativeEvent.coordinate)}
      >
        {pin
          ? <Marker testID='location-pin' coordinate={pin} title={TEXTS.pin} draggable onDragEnd={(event) => moveTo(event.nativeEvent.coordinate)} />
          : null}
      </MapView>
      <Text style={styles.hint}>{pin ? TEXTS.hint : TEXTS.empty}</Text>
      {error ? <Text style={styles.error} accessibilityRole='alert'>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  map: { height: 240, borderRadius: 8 },
  hint: { fontSize: 12, color: '#666' },
  message: { fontSize: 13, color: '#8a5a00' },
  error: { color: '#b42318', fontSize: 13 }
})
