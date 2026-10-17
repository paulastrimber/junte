import { useContext } from 'react'
import { View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'

import { Button } from '../components/Button.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createThemedStyles, spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'No pudimos abrir tu sesión',
  retry: 'Reintentar',
  signOut: 'Cerrar sesión'
})

/** Hay una sesión guardada pero no se pudo verificar (sin conexión, servidor caído): se conserva y se reintenta. */
export default function RestoreErrorScreen () {
  const styles = useStyles()
  const { error, retryRestore, signOut } = useAuth()
  // Pantalla sin encabezado: "Cerrar sesión" queda arriba de la barra del sistema (fuera de un navegador no hay insets).
  const insets = useContext(SafeAreaInsetsContext)
  return (
    <View style={styles.container}>
      <ErrorState title={TEXTS.title} error={error} onRetry={retryRestore} retryTitle={TEXTS.retry} fill />
      <View style={[styles.bottom, { paddingBottom: spacing.xl + (insets?.bottom ?? 0) }]}>
        <Button title={TEXTS.signOut} variant='ghost' onPress={signOut} />
      </View>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  container: { flex: 1, backgroundColor: colors.background },
  bottom: { paddingHorizontal: spacing.xl }
}))
