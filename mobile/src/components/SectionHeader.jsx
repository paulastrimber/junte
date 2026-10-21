import { View } from 'react-native'

import { spacing } from '../theme/index.js'
import { Button } from './Button.jsx'
import { Text } from './Text.jsx'

/**
 * Título de una sección dentro de una pantalla ("Quiénes van", "Dónde", "Tipo de actividad"), en minúscula
 * de oración, con una bajada y una acción opcionales. El título de la pantalla lo pone la navegación, no esto.
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {string} [props.actionTitle]  Acción secundaria a la derecha ("Ver todos", "Limpiar").
 * @param {() => void} [props.onAction]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]  Solo para ubicarlo.
 */
export function SectionHeader ({ title, description, actionTitle, onAction, style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <Text variant='heading' accessibilityRole='header'>{title}</Text>
        {description ? <Text variant='caption' color='textMuted'>{description}</Text> : null}
      </View>
      {actionTitle && onAction ? <Button title={actionTitle} variant='ghost' size='sm' onPress={onAction} style={styles.action} /> : null}
    </View>
  )
}

const styles = {
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
  // El botón fantasma ya tiene relleno propio: se corre para que su texto quede alineado con el borde.
  action: { marginRight: -spacing.lg }
}
