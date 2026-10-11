import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { CATALOG_STATUS } from '../hooks/useCatalogs.js'
import { Button } from './Button.jsx'

/**
 * Muestra el contenido cuando los catálogos están cargados; mientras tanto, cargando o el error con "Reintentar".
 * @param {{ status: string, onRetry: () => void, children: import('react').ReactNode }} props
 */
export function CatalogGate ({ status, onRetry, children }) {
  if (status === CATALOG_STATUS.READY) return children
  if (status === CATALOG_STATUS.LOADING) {
    return (
      <View style={styles.box}>
        <ActivityIndicator accessibilityLabel='Cargando opciones' />
        <Text>Cargando opciones…</Text>
      </View>
    )
  }
  return (
    <View style={styles.box}>
      <Text style={styles.error}>No pudimos cargar las opciones.</Text>
      <Button title='Reintentar' variant='secondary' onPress={onRetry} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  error: { color: '#b42318' }
})
