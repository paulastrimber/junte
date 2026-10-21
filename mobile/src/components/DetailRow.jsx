import { View } from 'react-native'

import { createThemedStyles, radius, sizes, spacing } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Un dato con su rótulo y un ícono ("Cuándo · sáb 25/10, 18:00 a 20:00"). Se lee como una sola cosa: el lector
 * de pantalla dice "Cuándo, sáb 25/10…". El valor se puede seleccionar y copiar (una dirección, un email).
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} [props.icon]  Nombre de Ionicons.
 * @param {string} [props.hint]  Aclaración debajo del valor ("a 2,4 km", "Quedan 3 lugares").
 */
export function DetailRow ({ label, value, icon, hint }) {
  const styles = useStyles()
  return (
    <View style={styles.row} accessible accessibilityLabel={hint ? `${label}: ${value}. ${hint}` : `${label}: ${value}`}>
      {icon
        ? (
          <View style={styles.icon}>
            <Icon name={icon} color='onPrimarySoft' />
          </View>
          )
        : null}
      <View style={styles.text}>
        <Text variant='caption' color='textMuted'>{label}</Text>
        <Text variant='bodyStrong' selectable>{value}</Text>
        {hint ? <Text variant='caption' color='textMuted'>{hint}</Text> : null}
      </View>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: sizes.touchSmall, height: sizes.touchSmall, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  text: { flex: 1, gap: spacing.xxs }
}))
