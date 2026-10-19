import { View } from 'react-native'

import { borders, createThemedStyles, fonts } from '../theme/index.js'
import { Text } from './Text.jsx'

/**
 * La marca: "junte" en minúsculas con el punto lima. Va en las pantallas de acceso y en el onboarding.
 * @param {object} props
 * @param {number} [props.size]  Tamaño de la letra; el punto se calcula a partir de él.
 */
export function Wordmark ({ size = 40 }) {
  const styles = useStyles()
  const dot = Math.round(size * 0.2)
  return (
    <View style={styles.row} accessible accessibilityRole='image' accessibilityLabel='junte'>
      <Text color='primary' style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -size * 0.04 }]}>junte</Text>
      {/* El punto se apoya en la línea de base de la palabra. */}
      <View style={[styles.dot, { width: dot, height: dot, marginBottom: Math.round(size * 0.2) }]} />
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-start', gap: 3 },
  word: { fontFamily: fonts.extrabold },
  // En claro, el lima sobre el fondo casi no se ve: lleva un borde (`accentEdge`). En oscuro el borde es del mismo lima.
  dot: { borderRadius: 999, backgroundColor: colors.accent, borderWidth: borders.thin, borderColor: colors.accentEdge }
}))
