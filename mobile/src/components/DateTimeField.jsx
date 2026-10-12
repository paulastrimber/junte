import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDateTime } from '../utils/plans.js'

/**
 * Selector de fecha y hora (un instante, en la hora del teléfono). El valor entra y sale como `Date`.
 * Android abre dos diálogos nativos seguidos (día y después hora); iOS despliega el selector en línea.
 * @param {object} props
 * @param {string} props.label
 * @param {Date | null} props.value
 * @param {(value: Date) => void} props.onChange
 * @param {Date} [props.minimumDate]
 * @param {Date} [props.defaultDate]  Lo que muestra el selector cuando todavía no hay valor.
 * @param {string} [props.error]
 */
export function DateTimeField ({ label, value, onChange, minimumDate, defaultDate, error }) {
  const [isOpen, setIsOpen] = useState(false)
  const pickerValue = value ?? defaultDate ?? new Date()

  function pickTime (day) {
    DateTimePickerAndroid.open({
      value: day,
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, time) => { if (time) onChange(time) }
    })
  }

  function open () {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode: 'date',
        minimumDate,
        // El día elegido conserva la hora que ya había; el segundo diálogo la ajusta.
        onValueChange: (_event, day) => { if (day) pickTime(day) }
      })
    } else {
      setIsOpen((current) => !current)
    }
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityHint='Abre el selector de fecha y hora'
        onPress={open}
        style={[styles.input, error && styles.inputError]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value ? formatDateTime(value) : 'Elegir fecha y hora'}</Text>
      </Pressable>
      {isOpen && Platform.OS !== 'android'
        ? (
          <DateTimePicker
            testID={`${label}-picker`}
            value={pickerValue}
            mode='datetime'
            display='spinner'
            minimumDate={minimumDate}
            onValueChange={(_event, date) => { if (date) onChange(date) }}
          />
          )
        : null}
      {error ? <Text style={styles.error} accessibilityRole='alert'>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#222' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff' },
  inputError: { borderColor: '#b42318' },
  value: { fontSize: 16, color: '#222' },
  placeholder: { fontSize: 16, color: '#888' },
  error: { color: '#b42318', fontSize: 13 }
})
