import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { HEALTH_VIEW_STATUS, useHealth } from '../hooks/useHealth.js'

// Pantalla de diagnóstico (S1-MOB-02): verifica que la app llega a la API del entorno.
// Muestra code y requestId siempre porque su único fin es rastrear fallas en los logs.

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
  const { status, requestId, error, retry } = useHealth()
  const isLoading = status === HEALTH_VIEW_STATUS.LOADING

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole='header'>{TEXTS.title}</Text>

      {isLoading && (
        <View style={styles.row}>
          <ActivityIndicator accessibilityLabel={TEXTS.loading} />
          <Text>{TEXTS.loading}</Text>
        </View>
      )}

      {status === HEALTH_VIEW_STATUS.OK && (
        <Text style={[styles.message, styles.ok]}>{TEXTS.ok}</Text>
      )}

      {status === HEALTH_VIEW_STATUS.DEGRADED && (
        <Text style={[styles.message, styles.degraded]}>{TEXTS.degraded}</Text>
      )}

      {status === HEALTH_VIEW_STATUS.ERROR && (
        <View style={styles.errorBox}>
          <Text style={[styles.message, styles.error]}>{TEXTS.errorTitle}</Text>
          <Text>{error?.message}</Text>
          <Text style={styles.detail}>{TEXTS.code}: {error?.code}</Text>
        </View>
      )}

      {!isLoading && requestId && (
        <Text style={styles.detail} selectable>{TEXTS.requestId}: {requestId}</Text>
      )}

      <Pressable
        accessibilityRole='button'
        accessibilityState={{ disabled: isLoading }}
        disabled={isLoading}
        onPress={retry}
        style={({ pressed }) => [styles.button, (pressed || isLoading) && styles.buttonDimmed]}
      >
        <Text style={styles.buttonText}>{TEXTS.retry}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 22,
    fontWeight: '600'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  message: {
    fontSize: 16,
    textAlign: 'center'
  },
  ok: {
    color: '#1b7f3b'
  },
  degraded: {
    color: '#9a6700'
  },
  error: {
    color: '#b42318',
    fontWeight: '600'
  },
  errorBox: {
    alignItems: 'center',
    gap: 4
  },
  detail: {
    fontSize: 12,
    color: '#555'
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1f4fd1'
  },
  buttonDimmed: {
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600'
  }
})
