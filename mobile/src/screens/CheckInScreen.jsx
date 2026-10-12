import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { QrScanner } from '../components/QrScanner.jsx'
import { CHECK_IN_STATUS, useCheckIn } from '../hooks/useCheckIn.js'
import { requestCameraPermission } from '../services/camera.js'

export const TEXTS = Object.freeze({
  title: 'Registrar asistencia',
  askingCamera: 'Pidiendo permiso para usar la cámara…',
  cameraDenied: 'Para escanear el QR necesitamos la cámara. Dale permiso a junte desde los ajustes del teléfono.',
  retryCamera: 'Probar de nuevo',
  scanHint: 'Apuntá la cámara al QR que muestra quien organiza el plan. También vamos a usar tu ubicación para confirmar que estás en el lugar.',
  locating: 'Obteniendo tu ubicación…',
  sending: 'Registrando tu asistencia…',
  doneTitle: '¡Asistencia registrada!',
  doneMessage: 'Sumaste 1 punto de reputación.',
  scanAgain: 'Escanear de nuevo',
  back: 'Volver al plan'
})

const CAMERA = Object.freeze({ ASKING: 'asking', GRANTED: 'granted', DENIED: 'denied' })

export default function CheckInScreen ({ navigation, route }) {
  const { planId } = route.params
  const checkIn = useCheckIn(planId)
  const { submit, reset } = checkIn
  const [camera, setCamera] = useState(CAMERA.ASKING)
  const [cameraAttempt, setCameraAttempt] = useState(0)

  // El permiso se pide al entrar (es el momento en que se usa la cámara) y cada vez que se reintenta.
  useEffect(() => {
    let isCurrent = true
    requestCameraPermission().then((isGranted) => {
      if (isCurrent) setCamera(isGranted ? CAMERA.GRANTED : CAMERA.DENIED)
    })
    return () => { isCurrent = false }
  }, [cameraAttempt])

  const askCamera = useCallback(() => {
    setCamera(CAMERA.ASKING)
    setCameraAttempt((value) => value + 1)
  }, [])

  const scan = useCallback((data) => { submit({ qrToken: data }) }, [submit])
  const goBack = useCallback(() => navigation.goBack(), [navigation])

  if (checkIn.status === CHECK_IN_STATUS.DONE) {
    return (
      <View style={styles.center}>
        <Text style={styles.doneTitle} accessibilityRole='header'>{TEXTS.doneTitle}</Text>
        <Text style={styles.text}>{TEXTS.doneMessage}</Text>
        <Button title={TEXTS.back} onPress={goBack} />
      </View>
    )
  }

  if (checkIn.status === CHECK_IN_STATUS.ERROR) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={checkIn.error.message} requestId={checkIn.error.requestId} />
        {checkIn.error.canRetry ? <Button title={TEXTS.scanAgain} onPress={reset} /> : null}
        <Button title={TEXTS.back} variant='secondary' onPress={goBack} />
      </View>
    )
  }

  if (checkIn.isWorking) {
    const progress = checkIn.status === CHECK_IN_STATUS.LOCATING ? TEXTS.locating : TEXTS.sending
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={progress} />
        <Text style={styles.text}>{progress}</Text>
      </View>
    )
  }

  if (camera === CAMERA.ASKING) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={TEXTS.askingCamera} />
        <Text style={styles.text}>{TEXTS.askingCamera}</Text>
      </View>
    )
  }

  if (camera === CAMERA.DENIED) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={TEXTS.cameraDenied} />
        <Button title={TEXTS.retryCamera} onPress={askCamera} />
        <Button title={TEXTS.back} variant='secondary' onPress={goBack} />
      </View>
    )
  }

  return (
    <View style={styles.content}>
      <Text style={styles.text}>{TEXTS.scanHint}</Text>
      <QrScanner onScan={scan} />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: '#fff' },
  content: { flex: 1, padding: 24, gap: 16, backgroundColor: '#fff' },
  text: { fontSize: 15, color: '#333', textAlign: 'center' },
  doneTitle: { fontSize: 22, fontWeight: '700', color: '#1b7f3b', textAlign: 'center' }
})
