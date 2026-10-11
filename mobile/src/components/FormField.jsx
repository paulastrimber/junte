import { StyleSheet, Text, TextInput, View } from 'react-native'

/**
 * Campo de texto con etiqueta y error. Presentacional: no conoce validaciones ni la API.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 */
export function FormField ({ label, error, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor='#888'
        {...inputProps}
      />
      {error ? <Text style={styles.error} accessibilityRole='alert'>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#222' },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff'
  },
  inputError: { borderColor: '#b42318' },
  error: { color: '#b42318', fontSize: 13 }
})
