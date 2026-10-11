import { render, screen } from '@testing-library/react-native'

import App from './App.jsx'
import { authService } from './services/auth.js'
import { TEXTS as LOGIN } from './screens/LoginScreen.jsx'

jest.mock('./services/auth.js', () => {
  const actual = jest.requireActual('./services/auth.js')
  return {
    ...actual,
    authService: {
      ...actual.authService,
      restore: jest.fn(),
      onSessionExpired: jest.fn(() => () => {})
    }
  }
})
jest.mock('./services/api/client.js', () => ({
  ...jest.requireActual('./services/api/client.js'),
  configureApiAuth: jest.fn()
}))

describe('App', () => {
  it('arranca sin sesión guardada en el login, dentro del stack de navegación', async () => {
    authService.restore.mockResolvedValueOnce(null)

    await render(<App />)

    expect(await screen.findByRole('button', { name: LOGIN.submit })).toBeOnTheScreen()
  })

  it('al arrancar le da al cliente HTTP la sesión (token, refresh y aviso de sesión terminada)', () => {
    // configureApiAuth se llama al importar App: se vuelve a importar en un registro aislado para verlo.
    jest.isolateModules(() => {
      const { configureApiAuth } = require('./services/api/client.js')

      require('./App.jsx')

      expect(configureApiAuth).toHaveBeenCalledWith(expect.objectContaining({
        getAccessToken: expect.any(Function),
        refreshSession: expect.any(Function),
        onSessionExpired: expect.any(Function)
      }))
    })
  })
})
