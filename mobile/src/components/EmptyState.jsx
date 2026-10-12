import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button.jsx'

/**
 * Estado "vacío" o "no disponible" de una pantalla: un mensaje y, opcionalmente, una acción.
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.actionTitle]
 * @param {() => void} [props.onAction]
 */
export function EmptyState ({ title, message, actionTitle, onAction }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} variant='secondary' onPress={onAction} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  title: { fontSize: 17, fontWeight: '600', color: '#222', textAlign: 'center' },
  message: { fontSize: 14, color: '#555', textAlign: 'center' }
})
