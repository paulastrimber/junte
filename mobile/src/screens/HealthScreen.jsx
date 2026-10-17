import { StyleSheet, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { HEALTH_VIEW_STATUS, useHealth } from '../hooks/useHealth.js'
import { spacing } from '../theme/index.js'

// Pantalla de diagnóstico (S1-MOB-02): verifica que la app llega a la API del entorno.
// Muestra code y requestId siempre (también fuera de desarrollo) porque su único fin es rastrear fallas en los logs.

export const TEXTS = Object.freeze({
  title: 'Estado del servidor',
  loading: 'Consultando el servidor…',
  ok: 'Todo funciona: la API responde.',
  degraded: 'El servidor responde, pero algún servicio interno no está disponible.',
  errorTitle: 'No pudimos verificar el servidor.',
  code: 'Código',
  requestId: 'requestId',
  retry: 'Reintentar'
})

export default function HealthScreen () {
  // El título lo pone el encabezado de navegación.
  const { status, requestId, error, retry } = useHealth()
  const isLoading = status === HEALTH_VIEW_STATUS.LOADING

  return (
    <Screen>
      {isLoading ? <LoadingState label={TEXTS.loading} /> : null}

      {status === HEALTH_VIEW_STATUS.OK ? <Notice tone='success' message={TEXTS.ok} /> : null}

      {status === HEALTH_VIEW_STATUS.DEGRADED ? <Notice tone='warning' message={TEXTS.degraded} /> : null}

      {/* El requestId va abajo, siempre visible: acá no se repite (ErrorBanner lo mostraría solo en desarrollo). */}
      {status === HEALTH_VIEW_STATUS.ERROR ? <ErrorBanner title={TEXTS.errorTitle} error={error} requestId={null} /> : null}

      {!isLoading && (error?.code || requestId)
        ? (
          <View style={styles.details}>
            {error?.code ? <Text variant='caption' color='textMuted' selectable>{TEXTS.code}: {error.code}</Text> : null}
            {requestId ? <Text variant='caption' color='textMuted' selectable>{TEXTS.requestId}: {requestId}</Text> : null}
          </View>
          )
        : null}

      <Button title={TEXTS.retry} variant='secondary' icon='refresh-outline' loading={isLoading} onPress={retry} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  details: { gap: spacing.xxs }
})
