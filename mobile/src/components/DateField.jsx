import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform } from 'react-native'

import { MAX_AGE, formatForDisplay, toCalendarDate, toLocalDate } from '../utils/dates.js'
import { FieldButton } from './FieldButton.jsx'

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
    <FieldButton
      label={label}
      value={value ? formatForDisplay(value) : ''}
      placeholder='Elegir fecha'
      icon='calendar-outline'
      accessibilityHint='Abre el selector de fecha'
      onPress={open}
      error={error}
    >
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
    </FieldButton>
  )
}
