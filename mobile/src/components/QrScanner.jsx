import { CameraView } from 'expo-camera'
import { StyleSheet, View } from 'react-native'

import { createThemedStyles, radius, spacing } from '../theme/index.js'

const QR_ONLY = Object.freeze({ barcodeTypes: ['qr'] })

// Esquinas del visor: dicen dónde apuntar sin tapar la imagen.
const CORNERS = Object.freeze(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])
const CORNER = spacing.xxl
const CORNER_WIDTH = spacing.xs

/**
 * Cámara que lee códigos QR. Presentacional: avisa lo que leyó y no decide nada. El permiso lo pide quien la usa.
 * @param {object} props
 * @param {(data: string) => void} props.onScan  Texto del QR leído.
 * @param {boolean} [props.paused]  Deja de leer (mientras se procesa una lectura).
 */
export function QrScanner ({ onScan, paused = false }) {
  const styles = useStyles()
  return (
    <View style={styles.frame}>
      <CameraView
        testID='qr-camera'
        style={styles.camera}
        facing='back'
        barcodeScannerSettings={QR_ONLY}
        onBarcodeScanned={paused ? undefined : ({ data }) => onScan(data)}
      />
      <View style={[StyleSheet.absoluteFill, styles.finder, paused && styles.paused]} accessible={false} importantForAccessibility='no-hide-descendants'>
        {CORNERS.map((corner) => <View key={corner} style={[styles.corner, styles[corner]]} />)}
      </View>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  frame: { aspectRatio: 1, borderRadius: radius.xxl, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.media },
  camera: { flex: 1 },
  finder: { margin: spacing.xl, pointerEvents: 'none' },
  // Mientras se procesa una lectura, el visor se apaga: la cámara no está leyendo.
  paused: { opacity: 0.35 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.accent },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: radius.md },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: radius.md },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: radius.md },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: radius.md }
}))
