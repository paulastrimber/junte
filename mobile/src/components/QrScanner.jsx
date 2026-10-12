import { CameraView } from 'expo-camera'
import { StyleSheet, View } from 'react-native'

const QR_ONLY = Object.freeze({ barcodeTypes: ['qr'] })

/**
 * Cámara que lee códigos QR. Presentacional: avisa lo que leyó y no decide nada. El permiso lo pide quien la usa.
 * @param {object} props
 * @param {(data: string) => void} props.onScan  Texto del QR leído.
 * @param {boolean} [props.paused]  Deja de leer (mientras se procesa una lectura).
 */
export function QrScanner ({ onScan, paused = false }) {
  return (
    <View style={styles.frame}>
      <CameraView
        testID='qr-camera'
        style={styles.camera}
        facing='back'
        barcodeScannerSettings={QR_ONLY}
        onBarcodeScanned={paused ? undefined : ({ data }) => onScan(data)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111' },
  camera: { flex: 1 }
})
