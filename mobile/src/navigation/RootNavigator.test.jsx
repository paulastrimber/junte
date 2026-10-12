import { NavigationContainer } from '@react-navigation/native'
import { act, fireEvent, screen } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { resetFilterOptionsCache } from '../hooks/useFeedFilters.js'
import { TEXTS as CREATE } from '../screens/CreatePlanScreen.jsx'
import { TEXTS as HOME } from '../screens/HomeScreen.jsx'
import { TEXTS as LOADING } from '../screens/LoadingScreen.jsx'
import { TEXTS as LOGIN } from '../screens/LoginScreen.jsx'
import { TEXTS as ONBOARDING } from '../screens/OnboardingScreen.jsx'
import { TEXTS as PROFILE } from '../screens/ProfileScreen.jsx'
import { TEXTS as RESTORE } from '../screens/RestoreErrorScreen.jsx'
import { getCatalogs } from '../services/api/catalogs.js'
import { getPlanFilters, listMyPlans, listPlans } from '../services/api/plans.js'
import * as usersApi from '../services/api/users.js'
import { RootNavigator, TAB_TITLES } from './RootNavigator.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/health.js', () => ({ ...jest.requireActual('../services/api/health.js'), getHealth: jest.fn() }))
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ listPlans: jest.fn(), listMyPlans: jest.fn(), getPlan: jest.fn(), createPlan: jest.fn(), updatePlan: jest.fn(), getPlanFilters: jest.fn() }))
jest.mock('../services/api/feed.js', () => ({ getFeed: jest.fn() }))

const renderApp = (service) => renderWithAuth(<NavigationContainer><RootNavigator /></NavigationContainer>, { service })

// La app con sesión abre en el feed (tab "Planes"); el perfil está en su propio tab.
const findApp = () => screen.findByRole('button', { name: HOME.filters })
const openTab = async (title) => fireEvent.press(await screen.findByText(title))
const openProfile = async () => {
  await findApp()
  await openTab(TAB_TITLES.profile)
  return screen.findByRole('button', { name: PROFILE.save })
}

describe('RootNavigator (navegación protegida)', () => {
  beforeEach(() => {
    getCatalogs.mockResolvedValue(CATALOG)
    usersApi.getMe.mockResolvedValue({ reputation: 0, noShowCount: 0 })
    listMyPlans.mockResolvedValue({ items: [], nextCursor: null })
    resetFilterOptionsCache()
    getPlanFilters.mockResolvedValue({ priceRanges: [], radiusKm: { min: 0.5, max: 50, default: 10 } })
    // Sin permiso de ubicación (el mock por defecto) el feed lista por fecha.
    listPlans.mockResolvedValue({ items: [], nextCursor: null })
  })

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

  it('con sesión válida muestra la app (el feed de planes) sin pasar por el login', async () => {
    await renderApp(createFakeAuthService({ user: COMPLETE_USER }))

    expect(await findApp()).toBeOnTheScreen()
    expect(await screen.findByText(HOME.emptyTitle)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: LOGIN.submit })).not.toBeOnTheScreen()
  })

  it('los tabs llevan a crear un plan y al perfil', async () => {
    await renderApp(createFakeAuthService({ user: COMPLETE_USER }))
    await findApp()

    await openTab(TAB_TITLES.create)
    expect(await screen.findByRole('button', { name: CREATE.create })).toBeOnTheScreen()

    await openTab(TAB_TITLES.profile)
    expect(await screen.findByRole('button', { name: PROFILE.save })).toBeOnTheScreen()
  })

  it('con el perfil incompleto, el tab de crear explica qué falta y lleva al perfil', async () => {
    await renderApp(createFakeAuthService({ user: { ...USER, onboardingCompleted: true } }))
    await findApp()

    await openTab(TAB_TITLES.create)
    expect(await screen.findByText(CREATE.incompleteTitle)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: CREATE.goToProfile }))

    expect(await screen.findByRole('button', { name: PROFILE.save })).toBeOnTheScreen()
  })

  it('un usuario nuevo (onboarding pendiente) ve el onboarding, no la app', async () => {
    await renderApp(createFakeAuthService({ user: USER }))

    expect(await screen.findByText('Paso 1 de 3')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: ONBOARDING.later })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PROFILE.save })).not.toBeOnTheScreen()
  })

  it('al terminar el onboarding ("Más tarde") entra a la app aunque el perfil siga incompleto', async () => {
    usersApi.updateMe.mockResolvedValue({ ...USER, onboardingCompleted: true })
    await renderApp(createFakeAuthService({ user: USER }))

    await fireEvent.press(await screen.findByRole('button', { name: ONBOARDING.later }))

    expect(await openProfile()).toBeOnTheScreen()
    expect(screen.getByText(PROFILE.incomplete)).toBeOnTheScreen()
    expect(screen.queryByText('Paso 1 de 3')).not.toBeOnTheScreen()
  })

  it('al registrarse se abre el onboarding; al iniciar sesión con onboarding hecho, la app', async () => {
    const service = createFakeAuthService({ user: null, register: jest.fn(async () => USER) })
    await renderApp(service)
    await fireEvent.press(await screen.findByRole('button', { name: LOGIN.register }))
    await fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Ana')
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@um.edu.uy')
    await fireEvent.changeText(screen.getByLabelText('Contraseña (mínimo 8 caracteres)'), 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: 'Registrarme' }))

    expect(await screen.findByText('Paso 1 de 3')).toBeOnTheScreen()
  })

  it('al iniciar sesión cambia al stack de la app', async () => {
    const service = createFakeAuthService({ user: null, login: jest.fn(async () => COMPLETE_USER) })
    await renderApp(service)
    await fireEvent.changeText(await screen.findByLabelText(LOGIN.email), 'ana@um.edu.uy')
    await fireEvent.changeText(screen.getByLabelText(LOGIN.password), 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: LOGIN.submit }))

    expect(await findApp()).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: LOGIN.submit })).not.toBeOnTheScreen()
  })

  it('al cerrar sesión vuelve al login y la pantalla protegida desaparece', async () => {
    await renderApp(createFakeAuthService({ user: COMPLETE_USER }))
    await openProfile()
    await fireEvent.press(await screen.findByRole('button', { name: PROFILE.signOut }))

    expect(await screen.findByRole('button', { name: LOGIN.submit })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PROFILE.save })).not.toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: HOME.filters })).not.toBeOnTheScreen()
  })

  it('si el cliente avisa que la sesión terminó (refresh rechazado) vuelve al login y dice por qué', async () => {
    const service = createFakeAuthService({ user: COMPLETE_USER })
    await renderApp(service)
    await findApp()

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

    expect(await findApp()).toBeOnTheScreen()
    expect(restore).toHaveBeenCalledTimes(2)
  })
})
