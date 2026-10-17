import { useKeepAwake } from 'expo-keep-awake'
import { ScrollView, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { SectionHeader } from '../components/SectionHeader.jsx'
import { Text } from '../components/Text.jsx'
import { CHECK_IN_STATUS, useCheckIn } from '../hooks/useCheckIn.js'
import { QR_STATUS, usePlanQr } from '../hooks/usePlanQr.js'
import { createThemedStyles, palettes, radius, spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'QR de asistencia',
  loading: 'Generando el QR…',
  errorTitle: 'No pudimos mostrar el QR',
  hint: 'Mostrales este QR a quienes llegan para que registren su asistencia. Se renueva solo cada poco más de un minuto: no sirve una foto. La pantalla queda encendida mientras lo mostrás.',
  retry: 'Reintentar',
  back: 'Volver al plan',
  myAttendance: 'Tu asistencia',
  myCheckIn: 'Registrar mi asistencia',
  myCheckInHint: 'Como organizás el plan no escaneás el QR: registramos tu asistencia con tu ubicación. Tu punto de reputación se suma al cerrar la asistencia, si vinieron al menos 2 personas más.',
  myCheckInDone: 'Tu asistencia quedó registrada.',
  locating: 'Obteniendo tu ubicación…',
  sending: 'Registrando tu asistencia…'
})

const QR_SIZE = 260
// El QR se lee mejor oscuro sobre blanco: el marco y los módulos quedan con los colores del modo claro también en
// modo oscuro (un QR claro sobre fondo oscuro muchos lectores no lo reconocen).
const QR_COLORS = Object.freeze({ code: palettes.light.text, background: palettes.light.surface })

/** Pantalla del creador: muestra el QR vigente (se renueva solo) y, si está inscripto, registra su propia asistencia. */
export default function PlanQrScreen ({ navigation, route }) {
  const styles = useStyles()
  // `canCheckIn`: el creador está inscripto y todavía no registró su asistencia (lo decide el detalle del plan).
  const { planId, canCheckIn = false } = route.params
  // La pantalla no se apaga mientras se muestra el QR (los que llegan lo van escaneando de a uno).
  useKeepAwake()
  const qr = usePlanQr(planId)
  const checkIn = useCheckIn(planId)
  const { retry } = qr
  const { submit } = checkIn

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {qr.status === QR_STATUS.LOADING ? <LoadingState label={TEXTS.loading} /> : null}

      {qr.status === QR_STATUS.READY
        ? (
          <View style={styles.block}>
            <Card padding='lg' style={styles.qrCard}>
              <View style={styles.qr}>
                <QRCode value={qr.qrToken} size={QR_SIZE} color={QR_COLORS.code} backgroundColor={QR_COLORS.background} />
              </View>
            </Card>
            <Text color='textMuted' center>{TEXTS.hint}</Text>
          </View>
          )
        : null}

      {/* "No disponible" (fuera de horario, plan cancelado) no se arregla reintentando: sin botón. */}
      {qr.status === QR_STATUS.ERROR || qr.status === QR_STATUS.UNAVAILABLE
        ? <ErrorState title={TEXTS.errorTitle} error={qr.error} onRetry={qr.status === QR_STATUS.ERROR ? retry : undefined} />
        : null}

      {canCheckIn && qr.status !== QR_STATUS.UNAVAILABLE
        ? (
          <View style={styles.block}>
            <SectionHeader title={TEXTS.myAttendance} />
            {checkIn.status === CHECK_IN_STATUS.DONE
              ? <Notice tone='success' message={TEXTS.myCheckInDone} accessibilityLiveRegion='polite' />
              : (
                <>
                  <Text variant='caption' color='textMuted'>{TEXTS.myCheckInHint}</Text>
                  {checkIn.isWorking ? <Text variant='label' color='textMuted' accessibilityLiveRegion='polite'>{checkIn.status === CHECK_IN_STATUS.LOCATING ? TEXTS.locating : TEXTS.sending}</Text> : null}
                  <ErrorBanner error={checkIn.error} />
                  <Button title={TEXTS.myCheckIn} variant='secondary' icon='location-outline' loading={checkIn.isWorking} onPress={submit} />
                </>
                )}
          </View>
          )
        : null}

      <Button title={TEXTS.back} variant='ghost' onPress={() => navigation.goBack()} />
    </ScrollView>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl },
  block: { gap: spacing.md },
  qrCard: { alignSelf: 'center', alignItems: 'center' },
  // Marco blanco en los dos modos: es parte del QR (la "zona de silencio" que necesita el lector).
  qr: { padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: QR_COLORS.background }
}))
