import { View } from 'react-native'

import { createThemedStyles, radius, spacing } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Por tono: color del texto y del ícono, fondo e ícono por defecto.
const TONES = Object.freeze({
  info: { color: 'onPrimarySoft', background: 'primarySoft', icon: 'information-circle-outline' },
  success: { color: 'success', background: 'successSoft', icon: 'checkmark-circle-outline' },
  warning: { color: 'warning', background: 'warningSoft', icon: 'alert-circle-outline' },
  danger: { color: 'danger', background: 'dangerSoft', icon: 'alert-circle-outline' }
})

/**
 * Aviso dentro de una pantalla (estado de la inscripción, plan lleno, sin permiso de ubicación…).
 * @param {object} props
 * @param {string} props.message
 * @param {'info' | 'success' | 'warning' | 'danger'} [props.tone]
 * @param {string} [props.icon]  Nombre de Ionicons; por defecto, el del tono.
 * @param {import('react').ReactNode} [props.children]  Detalle debajo del mensaje.
 */
export function Notice ({ message, tone = 'info', icon, children, ...viewProps }) {
  const styles = useStyles()
  const { color, background, icon: defaultIcon } = TONES[tone]
  return (
    <View style={[styles.notice, styles[background]]} {...viewProps}>
      <Icon name={icon ?? defaultIcon} color={color} />
      <View style={styles.body}>
        <Text variant='label' color={color} selectable>{message}</Text>
        {children}
      </View>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2, padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous' },
  body: { flex: 1, gap: 2 },
  primarySoft: { backgroundColor: colors.primarySoft },
  successSoft: { backgroundColor: colors.successSoft },
  warningSoft: { backgroundColor: colors.warningSoft },
  dangerSoft: { backgroundColor: colors.dangerSoft }
}))
