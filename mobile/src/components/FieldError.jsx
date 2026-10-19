import { StyleSheet, View } from 'react-native'

import { sizes, spacing } from '../theme/index.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Error de un dato que no es un `FormField` (intereses, cupo con "ilimitado"), con el mismo aspecto que el error de
 * un campo: ícono + texto en `danger`, anunciado como alerta. Sin `message` no pinta nada.
 * @param {{ message?: string | null }} props
 */
export function FieldError ({ message }) {
  if (!message) return null
  return (
    <View style={styles.row}>
      <Icon name='alert-circle-outline' size={sizes.iconSm} color='danger' />
      <Text variant='caption' color='danger' accessibilityRole='alert' style={styles.text}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { flex: 1 }
})
