import { render, screen } from '@testing-library/react-native'

import App from './App.jsx'
import { getHealth } from './services/api/health.js'
import { TEXTS } from './screens/HealthScreen.jsx'

jest.mock('./services/api/health.js', () => ({
  ...jest.requireActual('./services/api/health.js'),
  getHealth: jest.fn()
}))

describe('App', () => {
  it('arranca en la pantalla de health dentro del stack de navegación', async () => {
    getHealth.mockResolvedValueOnce({ status: 'ok', requestId: null })

    await render(<App />)

    expect(await screen.findByText(TEXTS.ok)).toBeOnTheScreen()
  })
})
