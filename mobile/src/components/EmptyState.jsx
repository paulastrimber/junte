import { View } from 'react-native'

import { borders, createThemedStyles, sizes, spacing } from '../theme/index.js'
import { Button } from './Button.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

// Por tono: fondo del círculo y color del ícono.
const TONES = Object.freeze({
  brand: { background: 'primarySoft', color: 'onPrimarySoft' },
  danger: { background: 'dangerSoft', color: 'danger' }
})

/**
 * Estado "vacío" o "no disponible" de una pantalla: un ícono con el punto lima de la marca, un mensaje y,
 * opcionalmente, una acción. Un vacío es una invitación: el mensaje dice qué hacer, no solo que no hay nada.
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.icon]  Nombre de Ionicons.
 * @param {string} [props.actionTitle]
 * @param {() => void} [props.onAction]
 * @param {'primary' | 'secondary'} [props.actionVariant]  `primary` cuando la acción es lo único que se puede
 *   hacer en la pantalla (p. ej. "Crear un plan" con el feed vacío).
 * @param {'brand' | 'danger'} [props.tone]  `danger`: algo que ya no está (plan cancelado o inexistente).
 * @param {boolean} [props.fill]  Ocupa toda la pantalla y centra el contenido.
 */
export function EmptyState ({ title, message, icon = 'compass-outline', actionTitle, onAction, actionVariant = 'secondary', tone = 'brand', fill = false }) {
  const styles = useStyles()
  const { background, color } = TONES[tone]
  return (
    <View style={[styles.box, fill && styles.fill]}>
      <View style={styles.mark}>
        <View style={[styles.orb, styles[background]]}>
          <Icon name={icon} size={sizes.iconXl} color={color} />
        </View>
        {/* El punto de la marca, como en el logo: el detalle que hace que el vacío sea de junte. */}
        {tone === 'brand' ? <View style={styles.dot} /> : null}
      </View>
      <Text variant='heading' center accessibilityRole='header'>{title}</Text>
      {message ? <Text variant='body' color='textMuted' center style={styles.message}>{message}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} variant={actionVariant} onPress={onAction} style={styles.action} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  box: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  fill: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  mark: { marginBottom: spacing.sm },
  orb: { width: sizes.orb, height: sizes.orb, borderRadius: sizes.orb / 2, alignItems: 'center', justifyContent: 'center' },
  primarySoft: { backgroundColor: colors.primarySoft },
  dangerSoft: { backgroundColor: colors.dangerSoft },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: spacing.xs,
    width: sizes.brandDot,
    height: sizes.brandDot,
    borderRadius: sizes.brandDot / 2,
    backgroundColor: colors.accent,
    borderWidth: borders.thick,
    borderColor: colors.accentEdge
  },
  message: { maxWidth: sizes.readable },
  action: { marginTop: spacing.md, alignSelf: 'stretch' }
}))
