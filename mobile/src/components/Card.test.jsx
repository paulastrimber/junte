import { fireEvent, render, screen } from '@testing-library/react-native'

import { Card } from './Card.jsx'
import { Text } from './Text.jsx'

describe('Card', () => {
  it('sin onPress es solo una superficie con su contenido (no es un botón)', async () => {
    await render(<Card><Text>Organiza Ana</Text></Card>)

    expect(screen.getByText('Organiza Ana')).toBeOnTheScreen()
    expect(screen.queryByRole('button')).not.toBeOnTheScreen()
  })

  it('con onPress es un botón con su nombre accesible', async () => {
    const onPress = jest.fn()
    await render(<Card onPress={onPress} accessibilityLabel='Ver tu reputación'><Text>Reputación</Text></Card>)

    await fireEvent.press(screen.getByRole('button', { name: 'Ver tu reputación' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
