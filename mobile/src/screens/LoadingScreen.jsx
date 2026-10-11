import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

export const TEXTS = Object.freeze({ loading: 'Cargando…' })

/** Mientras se lee la sesión guardada en el teléfono. */
export default function LoadingScreen () {
  return (
    <View style={styles.container}>
      <ActivityIndicator accessibilityLabel={TEXTS.loading} />
      <Text>{TEXTS.loading}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff' }
})
