import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

import { Chip } from './Chip.jsx'

describe('Chip', () => {
  it('es un checkbox con su texto como nombre y avisa al tocarlo', async () => {
    const onPress = jest.fn()
    await render(<Chip label='Pádel' selected={false} onPress={onPress} />)

    const chip = screen.getByRole('checkbox', { name: 'Pádel' })
    expect(chip).not.toBeChecked()
    await fireEvent.press(chip)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('como radio queda marcado según `selected`', async () => {
    await render(<Chip label='Con cupo' role='radio' selected onPress={jest.fn()} />)

    expect(screen.getByRole('radio', { name: 'Con cupo' })).toBeChecked()
  })

  it('deshabilitado no avisa', async () => {
    const onPress = jest.fn()
    await render(<Chip label='Teatro' selected={false} disabled onPress={onPress} />)

    expect(screen.getByRole('checkbox', { name: 'Teatro' })).toBeDisabled()
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Teatro' }))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('en iOS vibra suave al elegir; en Android no (responde la onda)', async () => {
    const original = Platform.OS
    try {
      Platform.OS = 'ios'
      await render(<Chip label='Fútbol' selected={false} onPress={jest.fn()} />)
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Fútbol' }))
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)

      Platform.OS = 'android'
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Fútbol' }))
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    } finally {
      Platform.OS = original
    }
  })
})
