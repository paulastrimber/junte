import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

/**
 * @param {object} props
 * @param {string} props.title
 * @param {() => void} props.onPress
 * @param {boolean} [props.loading]  Muestra un indicador y deshabilita el botón.
 * @param {boolean} [props.disabled]
 * @param {'primary' | 'secondary' | 'danger'} [props.variant]
 */
export function Button ({ title, onPress, loading = false, disabled = false, variant = 'primary' }) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      // No devuelve lo que devuelva `onPress`: los manejadores async (envíos de formularios) atrapan sus propios errores.
      onPress={() => { onPress() }}
      style={({ pressed }) => [styles.button, styles[variant], (pressed || isDisabled) && styles.dimmed]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'secondary' ? '#1f4fd1' : '#fff'} />
        : <Text style={[styles.text, variant === 'secondary' && styles.textSecondary]}>{title}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingHorizontal: 20, borderRadius: 8 },
  primary: { backgroundColor: '#1f4fd1' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1f4fd1' },
  danger: { backgroundColor: '#b42318' },
  dimmed: { opacity: 0.6 },
  text: { color: '#fff', fontWeight: '600', fontSize: 16 },
  textSecondary: { color: '#1f4fd1' }
})
