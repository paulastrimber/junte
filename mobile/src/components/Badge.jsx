import { View } from 'react-native'

import { createThemedStyles, radius, sizes, spacing } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Por tono: fondo y color del texto (pares que cumplen AA en los dos modos).
const TONES = Object.freeze({
  neutral: { background: 'surfaceAlt', color: 'textMuted' },
  primary: { background: 'primarySoft', color: 'onPrimarySoft' },
  // El lima: solo para lo que celebra o invita ("Gratis", "Vas"). Uno por tarjeta, como mucho.
  accent: { background: 'accent', color: 'onAccent' },
  success: { background: 'successSoft', color: 'success' },
  warning: { background: 'warningSoft', color: 'warning' },
  danger: { background: 'dangerSoft', color: 'danger' }
})

/**
 * Etiqueta corta de estado ("Gratis", "Lleno", "Asististe", "Cancelado"). No se toca: si hace falta una acción,
 * es un `Chip` o un `Button`. El texto ya dice el estado; el color lo refuerza, no lo reemplaza.
 * @param {object} props
 * @param {string} props.label
 * @param {'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'} [props.tone]
 * @param {string} [props.icon]  Nombre de Ionicons, antes del texto.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]  Solo para ubicarla.
 */
export function Badge ({ label, tone = 'neutral', icon, style }) {
  const styles = useStyles()
  const { background, color } = TONES[tone]
  return (
    <View style={[styles.badge, styles[background], style]}>
      {icon ? <Icon name={icon} size={sizes.iconSm} color={color} /> : null}
      <Text variant='micro' color={color} numberOfLines={1}>{label}</Text>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill
  },
  surfaceAlt: { backgroundColor: colors.surfaceAlt },
  primarySoft: { backgroundColor: colors.primarySoft },
  accent: { backgroundColor: colors.accent },
  successSoft: { backgroundColor: colors.successSoft },
  warningSoft: { backgroundColor: colors.warningSoft },
  dangerSoft: { backgroundColor: colors.dangerSoft }
}))
