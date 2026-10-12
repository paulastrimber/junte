import { ActivityIndicator, View } from 'react-native'

import { createThemedStyles, spacing, useTheme } from '../theme/index.js'
import { Text } from './Text.jsx'

/**
 * Estado "cargando" de una pantalla o de un bloque: indicador y texto que dice qué se está esperando.
 * @param {object} props
 * @param {string} props.label  "Cargando el plan…". También es el nombre accesible del indicador.
 * @param {boolean} [props.fill]  Ocupa toda la pantalla y centra el contenido.
 */
export function LoadingState ({ label, fill = false }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <View style={[styles.box, fill && styles.fill]}>
      <ActivityIndicator accessibilityLabel={label} color={colors.primary} />
      <Text variant='label' color='textMuted' center>{label}</Text>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  box: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  fill: { flex: 1, justifyContent: 'center', backgroundColor: colors.background }
}))
