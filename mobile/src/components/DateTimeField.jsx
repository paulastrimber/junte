import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Keyboard, Platform } from 'react-native'

import { formatDateTime } from '../utils/plans.js'
import { FieldButton } from './FieldButton.jsx'

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
 * @param {boolean} [props.required]
 * @param {(isOpen: boolean) => void} [props.onOpenChange]  iOS: cuando el selector en línea se despliega o se cierra
 *   (para scrollear hasta verlo entero).
 */
export function DateTimeField ({ label, value, onChange, minimumDate, defaultDate, error, required, onOpenChange }) {
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
      // Con el teclado abierto el selector (~216 pt) no entraría en lo que queda visible.
      if (!isOpen) Keyboard.dismiss()
      setIsOpen(!isOpen)
      onOpenChange?.(!isOpen)
    }
  }

  return (
    <FieldButton
      label={label}
      value={value ? formatDateTime(value) : ''}
      placeholder='Elegir fecha y hora'
      icon='time-outline'
      accessibilityHint='Abre el selector de fecha y hora'
      onPress={open}
      error={error}
      required={required}
    >
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
    </FieldButton>
  )
}
