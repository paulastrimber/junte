import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { MAX_AGE, formatForDisplay, toCalendarDate, toLocalDate } from '../utils/dates.js'

// Fecha que muestra el selector cuando todavía no hay ninguna elegida: unos 25 años atrás.
const DEFAULT_YEARS_AGO = 25

/**
 * Selector de fecha (día del calendario, sin hora). El valor entra y sale como `YYYY-MM-DD`.
 * Android abre el diálogo nativo; iOS despliega el selector en línea.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value  `YYYY-MM-DD` o ''
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.error]
 */
export function DateField ({ label, value, onChange, error }) {
  const [isOpen, setIsOpen] = useState(false)
  const now = new Date()
  const maximumDate = now
  const minimumDate = new Date(now.getFullYear() - MAX_AGE - 1, now.getMonth(), now.getDate())
  const pickerValue = toLocalDate(value) ?? new Date(now.getFullYear() - DEFAULT_YEARS_AGO, now.getMonth(), now.getDate(), 12)

  function handleValueChange (_event, date) {
    setIsOpen(false)
    if (date) onChange(toCalendarDate(date))
  }

  function open () {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue, mode: 'date', maximumDate, minimumDate, onValueChange: handleValueChange
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
        accessibilityHint='Abre el selector de fecha'
        onPress={open}
        style={[styles.input, error && styles.inputError]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{value ? formatForDisplay(value) : 'Elegir fecha'}</Text>
      </Pressable>
      {isOpen && Platform.OS !== 'android'
        ? (
          <DateTimePicker
            testID='birth-date-picker'
            value={pickerValue}
            mode='date'
            display='spinner'
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onValueChange={handleValueChange}
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
