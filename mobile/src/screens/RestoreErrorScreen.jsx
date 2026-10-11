import { StyleSheet, Text, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { messageForError } from '../utils/errorMessages.js'

export const TEXTS = Object.freeze({
  title: 'No pudimos abrir tu sesión',
  retry: 'Reintentar',
  signOut: 'Cerrar sesión'
})

/** Hay una sesión guardada pero no se pudo verificar (sin conexión, servidor caído): se conserva y se reintenta. */
export default function RestoreErrorScreen () {
  const { error, retryRestore, signOut } = useAuth()
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole='header'>{TEXTS.title}</Text>
      <Text style={styles.message}>{messageForError(error)}</Text>
      <Button title={TEXTS.retry} onPress={retryRestore} />
      <Button title={TEXTS.signOut} variant='secondary' onPress={signOut} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 16, textAlign: 'center' }
})
