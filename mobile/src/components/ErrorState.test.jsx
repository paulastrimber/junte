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

  it('toma el mensaje y el requestId del error del hook; el requestId solo en desarrollo', async () => {
    const error = { code: 'NETWORK_ERROR', message: 'Revisá tu conexión.', requestId: 'req-1' }
    await render(<ErrorState title='Falló' error={error} />)
    expect(screen.getByText('Revisá tu conexión.')).toBeOnTheScreen()
    expect(screen.getByText('requestId: req-1')).toBeOnTheScreen()

    const wasDev = global.__DEV__
    global.__DEV__ = false
    try {
      await screen.rerender(<ErrorState title='Falló' error={{ ...error }} />)
      expect(screen.getByText('Revisá tu conexión.')).toBeOnTheScreen()
      expect(screen.queryByText('requestId: req-1')).not.toBeOnTheScreen()
    } finally {
      global.__DEV__ = wasDev
    }
  })
})
