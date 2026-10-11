import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native'

/** Contenedor de pantallas con formularios: scroll y teclado que no tapa los campos. */
export function Screen ({ children }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, gap: 16 }
})
