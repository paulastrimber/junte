import { NavigationContainer } from '@react-navigation/native'
import { act, fireEvent, screen } from '@testing-library/react-native'

import { COMPLETE_USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { TEXTS as LOADING } from '../screens/LoadingScreen.jsx'
import { TEXTS as LOGIN } from '../screens/LoginScreen.jsx'
import { TEXTS as PROFILE } from '../screens/ProfileScreen.jsx'
import { TEXTS as RESTORE } from '../screens/RestoreErrorScreen.jsx'
import { RootNavigator } from './RootNavigator.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/health.js', () => ({ ...jest.requireActual('../services/api/health.js'), getHealth: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))

const renderApp = (service) => renderWithAuth(<NavigationContainer><RootNavigator /></NavigationContainer>, { service })

describe('RootNavigator (navegación protegida)', () => {
  it('mientras lee la sesión guardada muestra la pantalla de carga', async () => {
    const pending = deferred()
    await renderApp(createFakeAuthService({ restore: jest.fn(() => pending.promise) }))

    expect(screen.getByText(LOADING.loading)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: LOGIN.submit })).not.toBeOnTheScreen()
    await act(async () => pending.resolve(null))
  })

  it('sin sesión muestra el stack de acceso (login) y ninguna pantalla protegida', async () => {
    await renderApp(createFakeAuthService({ user: null }))

    expect(await screen.findByRole('button', { name: LOGIN.submit })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PROFILE.save })).not.toBeOnTheScreen()
  })

  it('desde el login se puede ir al registro', async () => {
    await renderApp(createFakeAuthService({ user: null }))

    await fireEvent.press(await screen.findByRole('button', { name: LOGIN.register }))

    expect(await screen.findByRole('button', { name: 'Registrarme' })).toBeOnTheScreen()
  })

  it('con sesión válida muestra la app (perfil) sin pasar por el login', async () => {
    await renderApp(createFakeAuthService({ user: COMPLETE_USER }))

    expect(await screen.findByRole('button', { name: PROFILE.save })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: LOGIN.submit })).not.toBeOnTheScreen()
  })

  it('al iniciar sesión cambia al stack de la app', async () => {
    const service = createFakeAuthService({ user: null, login: jest.fn(async () => COMPLETE_USER) })
    await renderApp(service)
    await fireEvent.changeText(await screen.findByLabelText(LOGIN.email), 'ana@um.edu.uy')
    await fireEvent.changeText(screen.getByLabelText(LOGIN.password), 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: LOGIN.submit }))

    expect(await screen.findByRole('button', { name: PROFILE.save })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: LOGIN.submit })).not.toBeOnTheScreen()
  })

  it('al cerrar sesión vuelve al login y la pantalla protegida desaparece', async () => {
    await renderApp(createFakeAuthService({ user: COMPLETE_USER }))
    await fireEvent.press(await screen.findByRole('button', { name: PROFILE.signOut }))

    expect(await screen.findByRole('button', { name: LOGIN.submit })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PROFILE.save })).not.toBeOnTheScreen()
  })

  it('si el cliente avisa que la sesión terminó (refresh rechazado) vuelve al login y dice por qué', async () => {
    const service = createFakeAuthService({ user: COMPLETE_USER })
    await renderApp(service)
    await screen.findByRole('button', { name: PROFILE.save })

    await act(async () => service.expire(new ApiError({ status: 401, code: 'UNAUTHENTICATED' })))

    expect(await screen.findByRole('button', { name: LOGIN.submit })).toBeOnTheScreen()
    expect(screen.getByText('Tu sesión terminó. Iniciá sesión de nuevo.')).toBeOnTheScreen()
  })

  it('sin conexión al abrir la app NO pide login: ofrece reintentar y conserva la sesión', async () => {
    const restore = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(COMPLETE_USER)
    await renderApp(createFakeAuthService({ restore }))

    expect(await screen.findByText(RESTORE.title)).toBeOnTheScreen()
    expect(screen.getByText(/No pudimos conectarnos/)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: RESTORE.retry }))

    expect(await screen.findByRole('button', { name: PROFILE.save })).toBeOnTheScreen()
    expect(restore).toHaveBeenCalledTimes(2)
  })
})
