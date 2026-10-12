import { useContext } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'

import { createThemedStyles, spacing } from '../theme/index.js'

/**
 * Contenedor de pantallas con formularios: scroll y teclado que no tapa los campos.
 * @param {object} props
 * @param {boolean} [props.safeTop]  Para pantallas SIN encabezado de navegación: deja libre la barra de estado.
 */
export function Screen ({ children, safeTop = false }) {
  const styles = useStyles()
  // Fuera de un navegador (tests de una pantalla suelta) no hay proveedor de áreas seguras.
  const insets = useContext(SafeAreaInsetsContext)
  const paddingTop = spacing.xl + (safeTop ? insets?.top ?? 0 : 0)
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop }]}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='interactive'
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg }
}))
