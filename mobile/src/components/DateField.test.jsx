import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { DateField } from './DateField.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  const DateTimePicker = (props) => <View {...props} />
  return { __esModule: true, default: DateTimePicker, DateTimePickerAndroid: { open: jest.fn() } }
})

const LABEL = 'Fecha de nacimiento'

function renderField (props = {}) {
  const onChange = jest.fn()
  return render(<DateField label={LABEL} value='' onChange={onChange} {...props} />).then((view) => ({ ...view, onChange }))
}

describe('DateField', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    DateTimePickerAndroid.open.mockReset()
  })

  it('sin valor invita a elegir una fecha; con valor la muestra como DD/MM/AAAA', async () => {
    await renderField()
    expect(screen.getByText('Elegir fecha')).toBeOnTheScreen()

    await renderField({ value: '2001-03-09' })
    expect(screen.getByText('09/03/2001')).toBeOnTheScreen()
  })

  it('muestra el error del campo', async () => {
    await renderField({ error: 'La fecha de nacimiento no puede ser futura.' })

    expect(screen.getByText('La fecha de nacimiento no puede ser futura.')).toBeOnTheScreen()
  })

  describe('iOS', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'))

    it('al tocar despliega el selector y devuelve el día LOCAL elegido como YYYY-MM-DD', async () => {
      const { onChange } = await renderField({ value: '2001-03-09' })
      expect(screen.queryByTestId('birth-date-picker')).not.toBeOnTheScreen()

      await fireEvent.press(screen.getByRole('button', { name: LABEL }))
      const picker = screen.getByTestId('birth-date-picker')
      // Las 23:30 locales del 14/05/1999 no pueden salir como el 15 por pasar por UTC.
      await act(async () => picker.props.onValueChange({}, new Date(1999, 4, 14, 23, 30)))

      expect(onChange).toHaveBeenCalledWith('1999-05-14')
      expect(screen.queryByTestId('birth-date-picker')).not.toBeOnTheScreen()
    })

    it('el selector arranca en la fecha actual del campo y no deja elegir fechas futuras', async () => {
      await renderField({ value: '2001-03-09' })

      await fireEvent.press(screen.getByRole('button', { name: LABEL }))
      const picker = screen.getByTestId('birth-date-picker')

      expect(picker.props.value.getFullYear()).toBe(2001)
      expect(picker.props.value.getMonth()).toBe(2)
      expect(picker.props.value.getDate()).toBe(9)
      expect(picker.props.maximumDate.getTime()).toBeLessThanOrEqual(Date.now())
      expect(picker.props.minimumDate.getFullYear()).toBeLessThan(new Date().getFullYear() - 100)
    })
  })

  describe('Android', () => {
    beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))

    it('abre el diálogo nativo y devuelve la fecha elegida', async () => {
      const { onChange } = await renderField({ value: '2001-03-09' })

      await fireEvent.press(screen.getByRole('button', { name: LABEL }))

      expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(expect.objectContaining({ mode: 'date' }))
      const options = DateTimePickerAndroid.open.mock.calls[0][0]
      expect(options.value.getFullYear()).toBe(2001)
      await act(async () => options.onValueChange({}, new Date(2002, 11, 31, 0, 10)))
      expect(onChange).toHaveBeenCalledWith('2002-12-31')
    })

    it('no despliega el selector en línea', async () => {
      await renderField()

      await fireEvent.press(screen.getByRole('button', { name: LABEL }))

      expect(screen.queryByTestId('birth-date-picker')).not.toBeOnTheScreen()
    })
  })
})
