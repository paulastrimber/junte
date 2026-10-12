import { View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { Icon } from '../components/Icon.jsx'
import { Text } from '../components/Text.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { createThemedStyles, sizes, spacing } from '../theme/index.js'
import { messageForError } from '../utils/errorMessages.js'

export const TEXTS = Object.freeze({
  title: 'No pudimos abrir tu sesión',
  retry: 'Reintentar',
  signOut: 'Cerrar sesión'
})

/** Hay una sesión guardada pero no se pudo verificar (sin conexión, servidor caído): se conserva y se reintenta. */
export default function RestoreErrorScreen () {
  const styles = useStyles()
  const { error, retryRestore, signOut } = useAuth()
  return (
    <View style={styles.container}>
      <View style={styles.orb}>
        <Icon name='cloud-offline-outline' size={sizes.iconLg + 4} color='danger' />
      </View>
      <Text variant='title' center accessibilityRole='header'>{TEXTS.title}</Text>
      <Text color='textMuted' center style={styles.message}>{messageForError(error)}</Text>
      <Button title={TEXTS.retry} icon='refresh-outline' onPress={retryRestore} />
      <Button title={TEXTS.signOut} variant='ghost' onPress={signOut} />
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  container: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: colors.background },
  orb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: colors.dangerSoft },
  message: { marginBottom: spacing.md }
}))
