import { useCallback, useEffect } from 'react'
import { View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { successFeedback } from '../components/haptics.js'
import { Icon } from '../components/Icon.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { QrScanner } from '../components/QrScanner.jsx'
import { Text } from '../components/Text.jsx'
import { CAMERA_PERMISSION, useCameraPermission } from '../hooks/useCameraPermission.js'
import { CHECK_IN_STATUS, useCheckIn } from '../hooks/useCheckIn.js'
import { createThemedStyles, sizes, spacing } from '../theme/index.js'

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
  errorTitle: 'No pudimos registrar tu asistencia',
  scanAgain: 'Escanear de nuevo',
  back: 'Volver al plan'
})

export default function CheckInScreen ({ navigation, route }) {
  const styles = useStyles()
  const { planId } = route.params
  const checkIn = useCheckIn(planId)
  const camera = useCameraPermission()
  const { submit, reset } = checkIn
  const { retry: askCamera } = camera

  const scan = useCallback((data) => { submit({ qrToken: data }) }, [submit])
  const goBack = useCallback(() => navigation.goBack(), [navigation])

  // Vibración de "salió bien" una sola vez, al llegar la confirmación del servidor.
  const isDone = checkIn.status === CHECK_IN_STATUS.DONE
  useEffect(() => {
    if (isDone) successFeedback()
  }, [isDone])

  if (isDone) {
    return (
      <View style={styles.center}>
        <View style={styles.orb}>
          <Icon name='checkmark-circle-outline' size={sizes.iconXl} color='success' />
        </View>
        <Text variant='display' color='success' center accessibilityRole='header'>{TEXTS.doneTitle}</Text>
        <Text color='textMuted' center accessibilityLiveRegion='polite'>{TEXTS.doneMessage}</Text>
        <Button title={TEXTS.back} onPress={goBack} style={styles.action} />
      </View>
    )
  }

  if (checkIn.status === CHECK_IN_STATUS.ERROR) {
    return (
      <View style={styles.screen}>
        <ErrorState
          title={TEXTS.errorTitle}
          error={checkIn.error}
          // Solo se ofrece volver a escanear si sirve (un QR vencido sí; fuera de horario, no).
          onRetry={checkIn.error.canRetry ? reset : undefined}
          retryTitle={TEXTS.scanAgain}
          fill
        />
        <View style={styles.bottom}>
          <Button title={TEXTS.back} variant='ghost' onPress={goBack} />
        </View>
      </View>
    )
  }

  if (checkIn.isWorking) {
    return <LoadingState label={checkIn.status === CHECK_IN_STATUS.LOCATING ? TEXTS.locating : TEXTS.sending} fill />
  }

  if (camera.status === CAMERA_PERMISSION.ASKING) return <LoadingState label={TEXTS.askingCamera} fill />

  if (camera.status === CAMERA_PERMISSION.DENIED) {
    return (
      <View style={styles.center}>
        {/* No es una falla: falta un permiso que la persona puede dar. */}
        <Notice tone='warning' icon='camera-outline' message={TEXTS.cameraDenied} />
        <Button title={TEXTS.retryCamera} icon='refresh-outline' onPress={askCamera} />
        <Button title={TEXTS.back} variant='ghost' onPress={goBack} />
      </View>
    )
  }

  return (
    <View style={styles.content}>
      <Text color='textMuted' center>{TEXTS.scanHint}</Text>
      <QrScanner onScan={scan} />
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center', backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background },
  orb: { width: sizes.orb, height: sizes.orb, borderRadius: sizes.orb / 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: colors.successSoft },
  action: { marginTop: spacing.md },
  bottom: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }
}))
