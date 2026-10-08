import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getHealth } from '../services/api/health.js'
import HealthScreen, { TEXTS } from './HealthScreen.jsx'

// Se mockea el service (no el hook): la pantalla se prueba junto con su hook real.
jest.mock('../services/api/health.js', () => ({
  ...jest.requireActual('../services/api/health.js'),
  getHealth: jest.fn()
}))

describe('HealthScreen', () => {
  beforeEach(() => {
    getHealth.mockReset()
  })

  it('muestra cargando y después ok', async () => {
    const pending = deferred()
    getHealth.mockReturnValueOnce(pending.promise)

    await render(<HealthScreen />)
    expect(screen.getByText(TEXTS.loading)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.retry })).toBeDisabled()

    await act(async () => pending.resolve({ status: 'ok', requestId: 'req-ok' }))

    expect(screen.getByText(TEXTS.ok)).toBeOnTheScreen()
    expect(screen.getByText(/req-ok/)).toBeOnTheScreen()
    expect(screen.queryByText(TEXTS.loading)).not.toBeOnTheScreen()
  })

  it('muestra degradado ante un 503', async () => {
    getHealth.mockResolvedValueOnce({
      status: 'degraded',
      requestId: 'req-503',
      error: new ApiError({ status: 503, code: 'INTERNAL', requestId: 'req-503' })
    })

    await render(<HealthScreen />)

    expect(await screen.findByText(TEXTS.degraded)).toBeOnTheScreen()
    expect(screen.getByText(/req-503/)).toBeOnTheScreen()
  })

  it('muestra el error con code y requestId, y reintenta', async () => {
    getHealth.mockRejectedValueOnce(new ApiError({
      status: 500,
      code: 'INTERNAL',
      message: 'Ocurrió un error en el servidor. Probá más tarde.',
      requestId: 'req-500'
    }))
    getHealth.mockResolvedValueOnce({ status: 'ok', requestId: null })

    await render(<HealthScreen />)

    expect(await screen.findByText(TEXTS.errorTitle)).toBeOnTheScreen()
    expect(screen.getByText('Ocurrió un error en el servidor. Probá más tarde.')).toBeOnTheScreen()
    expect(screen.getByText(/INTERNAL/)).toBeOnTheScreen()
    expect(screen.getByText(/req-500/)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

    expect(await screen.findByText(TEXTS.ok)).toBeOnTheScreen()
    expect(getHealth).toHaveBeenCalledTimes(2)
  })

  it('muestra el error de red sin requestId', async () => {
    getHealth.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    await render(<HealthScreen />)

    expect(await screen.findByText(/NETWORK_ERROR/)).toBeOnTheScreen()
    expect(screen.queryByText(/requestId/)).not.toBeOnTheScreen()
  })
})
