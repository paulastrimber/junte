import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Platform, StyleSheet } from 'react-native'

import { sizes } from '../theme/index.js'
import { Button } from './Button.jsx'

// Alto táctil real de un control: su alto mínimo más lo que el `hitSlop` agranda arriba y abajo.
function touchHeight (element) {
  const style = StyleSheet.flatten(typeof element.props.style === 'function' ? element.props.style({ pressed: false }) : element.props.style)
  const slop = element.props.hitSlop ?? {}
  return (style?.minHeight ?? 0) + (slop.top ?? 0) + (slop.bottom ?? 0)
}

describe('Button', () => {
  it('es un botón con su texto como nombre y avisa al tocarlo', async () => {
    const onPress = jest.fn()
    await render(<Button title='Inscribirme' onPress={onPress} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Inscribirme' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('deshabilitado no dispara onPress y lo anuncia', async () => {
    const onPress = jest.fn()
    await render(<Button title='Inscribirme' disabled onPress={onPress} />)

    const button = screen.getByRole('button', { name: 'Inscribirme' })
    await fireEvent.press(button)

    expect(button).toBeDisabled()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('cargando no dispara onPress, queda ocupado y reemplaza el texto por el indicador', async () => {
    const onPress = jest.fn()
    await render(<Button title='Crear plan' loading onPress={onPress} />)

    // El nombre accesible se conserva aunque el texto visible no esté.
    const button = screen.getByRole('button', { name: 'Crear plan' })
    await fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
    expect(button).toBeDisabled()
    expect(button).toBeBusy()
    expect(screen.queryByText('Crear plan')).not.toBeOnTheScreen()
  })

  it('el nombre accesible se puede reemplazar cuando el texto visible no alcanza', async () => {
    await render(<Button title='Filtros (2)' accessibilityLabel='Filtros, 2 activos' accessibilityHint='Abre los filtros' onPress={jest.fn()} />)

    const button = screen.getByRole('button', { name: 'Filtros, 2 activos' })
    expect(button.props.accessibilityHint).toBe('Abre los filtros')
    expect(screen.getByText('Filtros (2)')).toBeOnTheScreen()
  })

  it('el área táctil mide al menos 48 de alto, también el botón chico', async () => {
    await render(
      <>
        <Button title='Grande' onPress={jest.fn()} />
        <Button title='Chico' size='sm' onPress={jest.fn()} />
      </>
    )

    expect(touchHeight(screen.getByRole('button', { name: 'Grande' }))).toBeGreaterThanOrEqual(sizes.touch)
    expect(touchHeight(screen.getByRole('button', { name: 'Chico' }))).toBeGreaterThanOrEqual(sizes.touch)
  })

  it('con haptic vibra en iOS al tocarlo; sin haptic, no', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    try {
      await render(
        <>
          <Button title='Con vibración' haptic onPress={jest.fn()} />
          <Button title='Sin vibración' onPress={jest.fn()} />
        </>
      )

      await fireEvent.press(screen.getByRole('button', { name: 'Sin vibración' }))
      expect(Haptics.impactAsync).not.toHaveBeenCalled()
      await fireEvent.press(screen.getByRole('button', { name: 'Con vibración' }))
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
