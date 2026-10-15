import { View } from 'react-native'

import { createThemedStyles, sizes, spacing } from '../theme/index.js'
import { isOfflineError, messageForError } from '../utils/errorMessages.js'
import { Button } from './Button.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

export const ERROR_STATE_TEXTS = Object.freeze({
  offlineTitle: 'Sin conexión',
  retry: 'Reintentar'
})

/**
 * Estado "error" de una pantalla (S6-MOB-05): el mismo en toda la app. Un ícono, qué no se pudo hacer, el motivo según
 * el `code` (nunca un mensaje técnico), el requestId en desarrollo y "Reintentar". Sin conexión lo dice así.
 * @param {object} props
 * @param {string} props.title  "No pudimos cargar el plan."
 * @param {unknown} props.error  ApiError (u otro error: se muestra un mensaje genérico).
 * @param {() => void} [props.onRetry]
 * @param {Record<string, string>} [props.messages]  Textos propios de la pantalla por `code`.
 * @param {string} [props.retryTitle]
 * @param {boolean} [props.fill]  Ocupa toda la pantalla y centra el contenido.
 * @param {import('react').ReactNode} [props.children]  Algo más arriba del botón (p. ej. los filtros).
 */
export function ErrorState ({ title, error, onRetry, messages, retryTitle = ERROR_STATE_TEXTS.retry, fill = false, children }) {
  const styles = useStyles()
  const isOffline = isOfflineError(error)
  return (
    <View style={[styles.box, fill && styles.fill]} accessibilityRole='alert'>
      <View style={[styles.orb, isOffline ? styles.orbWarning : styles.orbDanger]}>
        <Icon name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={sizes.iconLg + 4} color={isOffline ? 'warning' : 'danger'} />
      </View>
      <Text variant='heading' center>{isOffline ? ERROR_STATE_TEXTS.offlineTitle : title}</Text>
      <Text variant='body' color='textMuted' center selectable>{messageForError(error, messages)}</Text>
      {/* El requestId sirve para rastrear la falla en los logs; solo se muestra en desarrollo. */}
      {__DEV__ && error?.requestId ? <Text variant='caption' color='textMuted' center selectable>requestId: {error.requestId}</Text> : null}
      {children}
      {onRetry ? <Button title={retryTitle} onPress={onRetry} style={styles.action} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  box: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  fill: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  orb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  orbDanger: { backgroundColor: colors.dangerSoft },
  orbWarning: { backgroundColor: colors.warningSoft },
  action: { marginTop: spacing.md, alignSelf: 'stretch' }
}))
