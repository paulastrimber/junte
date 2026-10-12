import { useKeepAwake } from 'expo-keep-awake'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { CHECK_IN_STATUS, useCheckIn } from '../hooks/useCheckIn.js'
import { QR_STATUS, usePlanQr } from '../hooks/usePlanQr.js'

export const TEXTS = Object.freeze({
  title: 'QR de asistencia',
  loading: 'Generando el QR…',
  hint: 'Mostrales este QR a quienes llegan para que registren su asistencia. Se renueva solo cada poco más de un minuto: no sirve una foto. La pantalla queda encendida mientras lo mostrás.',
  retry: 'Reintentar',
  back: 'Volver al plan',
  myCheckIn: 'Registrar mi asistencia',
  myCheckInHint: 'Como organizás el plan no escaneás el QR: registramos tu asistencia con tu ubicación. Tu punto de reputación se suma al cerrar la asistencia, si vinieron al menos 2 personas más.',
  myCheckInDone: 'Tu asistencia quedó registrada.',
  locating: 'Obteniendo tu ubicación…',
  sending: 'Registrando tu asistencia…'
})

const QR_SIZE = 260

/** Pantalla del creador: muestra el QR vigente (se renueva solo) y, si está inscripto, registra su propia asistencia. */
export default function PlanQrScreen ({ navigation, route }) {
  // `canCheckIn`: el creador está inscripto y todavía no registró su asistencia (lo decide el detalle del plan).
  const { planId, canCheckIn = false } = route.params
  // La pantalla no se apaga mientras se muestra el QR (los que llegan lo van escaneando de a uno).
  useKeepAwake()
  const qr = usePlanQr(planId)
  const checkIn = useCheckIn(planId)
  const { retry } = qr
  const { submit } = checkIn

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {qr.status === QR_STATUS.LOADING
        ? (
          <View style={styles.block}>
            <ActivityIndicator accessibilityLabel={TEXTS.loading} />
            <Text style={styles.text}>{TEXTS.loading}</Text>
          </View>
          )
        : null}

      {qr.status === QR_STATUS.READY
        ? (
          <View style={styles.block}>
            <View style={styles.qr}>
              <QRCode value={qr.qrToken} size={QR_SIZE} />
            </View>
            <Text style={styles.text}>{TEXTS.hint}</Text>
          </View>
          )
        : null}

      {qr.status === QR_STATUS.ERROR || qr.status === QR_STATUS.UNAVAILABLE
        ? (
          <View style={styles.block}>
            <ErrorBanner message={qr.error.message} requestId={qr.error.requestId} />
            {qr.status === QR_STATUS.ERROR ? <Button title={TEXTS.retry} onPress={retry} /> : null}
          </View>
          )
        : null}

      {canCheckIn && qr.status !== QR_STATUS.UNAVAILABLE
        ? (
          <View style={styles.block}>
            {checkIn.status === CHECK_IN_STATUS.DONE
              ? <Text style={styles.done} accessibilityLiveRegion='polite'>{TEXTS.myCheckInDone}</Text>
              : (
                <>
                  <Text style={styles.hint}>{TEXTS.myCheckInHint}</Text>
                  {checkIn.isWorking ? <Text style={styles.text}>{checkIn.status === CHECK_IN_STATUS.LOCATING ? TEXTS.locating : TEXTS.sending}</Text> : null}
                  <ErrorBanner message={checkIn.error?.message} requestId={checkIn.error?.requestId} />
                  <Button title={TEXTS.myCheckIn} variant='secondary' loading={checkIn.isWorking} onPress={() => submit()} />
                </>
                )}
          </View>
          )
        : null}

      <Button title={TEXTS.back} variant='secondary' onPress={() => navigation.goBack()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20, backgroundColor: '#fff' },
  block: { gap: 12 },
  qr: { alignSelf: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  text: { fontSize: 15, color: '#333', textAlign: 'center' },
  hint: { fontSize: 13, color: '#555' },
  done: { fontSize: 15, fontWeight: '600', color: '#1b7f3b', textAlign: 'center' }
})
