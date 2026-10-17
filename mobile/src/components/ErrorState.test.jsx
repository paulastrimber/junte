import { fireEvent, render, screen } from '@testing-library/react-native'

import { ErrorState } from './ErrorState.jsx'
import { Text } from './Text.jsx'

describe('ErrorState', () => {
  it('dice qué falló, por qué, y permite reintentar', async () => {
    const onRetry = jest.fn()
    await render(<ErrorState title='No pudimos cargar los planes.' message='Revisá tu conexión.' onRetry={onRetry} />)

    expect(screen.getByRole('header', { name: 'No pudimos cargar los planes.' })).toBeOnTheScreen()
    expect(screen.getByText('Revisá tu conexión.')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('sin onRetry no muestra el botón; el texto del botón se puede cambiar', async () => {
    await render(<ErrorState title='No pudimos cargar el chat.' />)
    expect(screen.queryByRole('button')).not.toBeOnTheScreen()

    await screen.rerender(<ErrorState title='No pudimos cargar el chat.' onRetry={jest.fn()} retryTitle='Probar de nuevo' />)
    expect(screen.getByRole('button', { name: 'Probar de nuevo' })).toBeOnTheScreen()
  })

  it('muestra lo que se le pase arriba del error (p. ej. los filtros)', async () => {
    await render(<ErrorState title='Falló'><Text>Filtros</Text></ErrorState>)

    expect(screen.getByText('Filtros')).toBeOnTheScreen()
  })
})
