import { fireEvent, render, screen } from '@testing-library/react-native'

import { FieldButton } from './FieldButton.jsx'

describe('FieldButton', () => {
  it('sin valor muestra el placeholder; el nombre accesible es la etiqueta', async () => {
    const onPress = jest.fn()
    await render(<FieldButton label='Universidad' placeholder='Elegir' onPress={onPress} />)

    expect(screen.getByText('Elegir')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Universidad' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('con valor lo muestra y lo expone como valor accesible', async () => {
    await render(<FieldButton label='Universidad' value='ORT' placeholder='Elegir' onPress={jest.fn()} />)

    expect(screen.getByText('ORT')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Universidad' })).toHaveAccessibilityValue({ text: 'ORT' })
  })

  it('deshabilitado muestra por qué y no se abre', async () => {
    await render(<FieldButton label='Carrera' placeholder='Elegir' disabled hint='Elegí primero una universidad.' onPress={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Carrera' })).toBeDisabled()
    expect(screen.getByText('Elegí primero una universidad.')).toBeOnTheScreen()
  })

  it('el error se anuncia como alerta', async () => {
    await render(<FieldButton label='Fecha' placeholder='Elegir fecha' error='Elegí una fecha.' onPress={jest.fn()} />)

    expect(screen.getByText('Elegí una fecha.')).toBeOnTheScreen()
    expect(screen.getByRole('alert')).toBeOnTheScreen()
  })
})
