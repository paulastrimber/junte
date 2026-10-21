import { View } from 'react-native'

import { createThemedStyles, sizes, spacing } from '../theme/index.js'
import { isOfflineError } from '../utils/errorMessages.js'
import { Button } from './Button.jsx'
import { ErrorBanner } from './ErrorBanner.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

export const ERROR_STATE_TEXTS = Object.freeze({
  offlineTitle: 'Sin conexión',
  retry: 'Reintentar'
})

/**
 * Estado "error" de una pantalla o de un bloque (S6-MOB-05): qué no se pudo hacer, por qué (el mensaje de la API) y
 * cómo seguir. Sin conexión lo dice así. Para errores de un formulario, que no reemplazan la pantalla, se usa
 * `ErrorBanner`.
 * @param {object} props
 * @param {string} props.title  Qué falló, en una frase ("No pudimos cargar los planes.").
 * @param {import('../utils/errorMessages.js').ViewError | null} [props.error]  El error que expone el hook: da el
 *   mensaje (por qué y qué hacer) y el `requestId`, que solo se muestra en desarrollo.
 * @param {string} [props.message]  Texto suelto, si no hay `error`.
 * @param {string} [props.requestId]
 * @param {() => void} [props.onRetry]
 * @param {string} [props.retryTitle]
 * @param {import('react').ReactNode} [props.children]  Algo más arriba del error (p. ej. los filtros del feed).
 * @param {boolean} [props.fill]  Ocupa toda la pantalla y centra el contenido.
 */
export function ErrorState ({ title, error, message = error?.message, requestId = error?.requestId, onRetry, retryTitle = ERROR_STATE_TEXTS.retry, children, fill = false }) {
  const styles = useStyles()
  const isOffline = isOfflineError(error)
  return (
    <View style={[styles.box, fill && styles.fill]}>
      {children}
      <View style={styles.head}>
        <View style={[styles.orb, isOffline ? styles.orbWarning : styles.orbDanger]}>
          <Icon name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={sizes.iconXl} color={isOffline ? 'warning' : 'danger'} />
        </View>
        <Text variant='heading' center accessibilityRole='header'>{isOffline ? ERROR_STATE_TEXTS.offlineTitle : title}</Text>
      </View>
      <ErrorBanner message={message} requestId={requestId} />
      {onRetry ? <Button title={retryTitle} icon='refresh-outline' onPress={onRetry} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  box: { gap: spacing.lg, padding: spacing.lg },
  fill: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  head: { alignItems: 'center', gap: spacing.md },
  orb: { width: sizes.orb, height: sizes.orb, borderRadius: sizes.orb / 2, alignItems: 'center', justifyContent: 'center' },
  orbDanger: { backgroundColor: colors.dangerSoft },
  orbWarning: { backgroundColor: colors.warningSoft }
}))
