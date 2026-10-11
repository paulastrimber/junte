import { StyleSheet, Text, View } from 'react-native'

/** Error general de un formulario o pantalla (no atado a un campo). */
export function ErrorBanner ({ message, requestId }) {
  if (!message) return null
  return (
    <View style={styles.banner} accessibilityRole='alert'>
      <Text style={styles.message}>{message}</Text>
      {/* El requestId sirve para rastrear la falla en los logs; solo se muestra en desarrollo. */}
      {__DEV__ && requestId ? <Text style={styles.detail} selectable>requestId: {requestId}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { padding: 12, borderRadius: 8, backgroundColor: '#fdecea', gap: 2 },
  message: { color: '#b42318', fontSize: 14 },
  detail: { color: '#555', fontSize: 11 }
})
