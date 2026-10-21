// Flujos principales de punta a punta en la UI: la app real (navegación, pantallas, hooks, services y cliente HTTP)
// con la API simulada por axios-mock-adapter. Lo único falso es la red, el almacenamiento seguro y el socket.
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import MockAdapter from 'axios-mock-adapter'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { CATALOG, COMPLETE_USER, USER } from '../tests/helpers/auth.jsx'
import { deferred } from '../tests/helpers/deferred.js'
import { ERROR_STATE_TEXTS } from './components/ErrorState.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { resetCatalogsCache } from './hooks/useCatalogs.js'
import { resetFilterOptionsCache } from './hooks/useFeedFilters.js'
import { RootNavigator, TAB_TITLES } from './navigation/RootNavigator.jsx'
import { TEXTS as CHAT } from './screens/ChatScreen.jsx'
import { TEXTS as CREATE } from './screens/CreatePlanScreen.jsx'
import { TEXTS as HOME } from './screens/HomeScreen.jsx'
import { TEXTS as LOGIN } from './screens/LoginScreen.jsx'
import { TEXTS as ONBOARDING } from './screens/OnboardingScreen.jsx'
import { TEXTS as PLAN } from './screens/PlanScreen.jsx'
import { configureApiAuth, getApiClient } from './services/api/client.js'
import { ApiError, CLIENT_ERROR_CODES } from './services/api/errors.js'
import { authService } from './services/auth.js'
import { socketService } from './services/socket.js'

jest.mock('expo-secure-store', () => require('../tests/helpers/memory-secure-store.js').createMemorySecureStore())
jest.mock('./config/index.js', () => ({
  ...jest.requireActual('./config/index.js'),
  getConfig: () => ({ apiUrl: 'http://api.test/api/v1', appEnv: 'test' })
}))
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
// Sin WebSocket (como con una red que no lo sostiene): el chat manda por REST y hace polling.
jest.mock('./services/socket.js', () => ({
  SOCKET_STATUS: { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', RECONNECTING: 'reconnecting', UNAVAILABLE: 'unavailable' },
  socketService: { subscribe: jest.fn(), sendChatMessage: jest.fn(), getStatus: jest.fn(), onStatusChange: jest.fn() }
}))

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const fromNow = (ms) => new Date(Date.now() + ms).toISOString()
const TODAY = new Date()
const todayAt = (hours, minutes) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), hours, minutes).toISOString()

const ME = { id: COMPLETE_USER.id, name: COMPLETE_USER.name, photoUrl: null, reputation: 0 }
const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' }

/** Un plan de otra persona que empieza en dos días (las fechas son relativas a hoy). */
function plan (overrides = {}) {
  return {
    id: 'p1',
    title: 'Fútbol 5 en Parque Rodó',
    description: null,
    startsAt: fromNow(2 * DAY_MS),
    endsAt: fromNow(2 * DAY_MS + 2 * HOUR_MS),
    location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.166, -34.913] },
    interests: ['futbol'],
    capacity: 10,
    participantCount: 7,
    availableSpots: 3,
    isFull: false,
    price: 0,
    status: 'open',
    photoUrl: null,
    creator: { id: 'u2', name: 'Lucía Pérez', photoUrl: null, reputation: 3 },
    isCreator: false,
    checkInOpensAt: fromNow(2 * DAY_MS - 15 * 60 * 1000),
    checkInClosesAt: fromNow(2 * DAY_MS + HOUR_MS),
    checkInRadiusMeters: 150,
    myParticipation: null,
    ...overrides
  }
}
const joined = (status = 'active') => ({ status, joinedAt: fromNow(-HOUR_MS), checkedInAt: null, noShow: false })
const page = (items, nextCursor = null) => ({ items, nextCursor })

let api
let navigationRef

/** La API "de fondo" que cualquier pantalla con sesión puede pedir. Cada test agrega o pisa lo que necesita. */
function backgroundApi () {
  api.onGet('/catalogs').reply(200, CATALOG)
  api.onGet('/plans/filters').reply(200, { priceRanges: [{ key: 'free', min: 0, max: 0 }], radiusKm: { min: 0.5, max: 50, default: 10 } })
  api.onGet('/users/me/plans').reply(200, page([]))
  api.onGet(/\/plans\/[^/]+\/participants$/).reply(200, page([]))
}

/** Sesión ya guardada en el teléfono (abre directo en la app). */
function storedSession (user = COMPLETE_USER) {
  SecureStore.data.set('junte.accessToken', TOKENS.accessToken)
  SecureStore.data.set('junte.refreshToken', TOKENS.refreshToken)
  api.onGet('/users/me').reply(200, user)
}

async function renderApp () {
  navigationRef = createNavigationContainerRef()
  return render(
    <AuthProvider>
      <NavigationContainer ref={navigationRef}><RootNavigator /></NavigationContainer>
    </AuthProvider>
  )
}

const requests = (method, url) => api.history[method].filter((request) => (url instanceof RegExp ? url.test(request.url) : request.url === url))
const button = (name) => screen.getByRole('button', { name })
const findButton = (name) => screen.findByRole('button', { name })
const goBack = () => act(async () => navigationRef.goBack())

async function openPlanFromFeed () {
  await fireEvent.press(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ }))
  return screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })
}

beforeAll(() => {
  configureApiAuth(authService.apiAuth)
})

beforeEach(async () => {
  jest.replaceProperty(Platform, 'OS', 'ios')
  SecureStore.data.clear()
  // La copia en memoria de los tokens queda de un test a otro: se borra como al cerrar sesión.
  await authService.apiAuth.onSessionExpired(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }))
  resetCatalogsCache()
  resetFilterOptionsCache()
  api = new MockAdapter(getApiClient())
  socketService.getStatus.mockReturnValue('unavailable')
  socketService.onStatusChange.mockReturnValue(() => {})
  socketService.subscribe.mockReturnValue(() => {})
  socketService.sendChatMessage.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
})

afterEach(() => {
  api.restore()
  jest.restoreAllMocks()
})

describe('flujo: login → onboarding salteado → feed', () => {
  it('inicia sesión, deja el onboarding para más tarde y ve el feed pedido con su token', async () => {
    backgroundApi()
    api.onPost('/auth/login').reply(200, { user: USER, ...TOKENS })
    api.onPut('/users/me').reply((config) => [200, { ...USER, ...JSON.parse(config.data) }])
    api.onGet('/plans').reply(200, page([plan()]))
    await renderApp()

    await fireEvent.changeText(await screen.findByLabelText(LOGIN.email), '  ana@um.edu.uy ')
    await fireEvent.changeText(screen.getByLabelText(LOGIN.password), 'secreto-123')
    await fireEvent.press(button(LOGIN.submit))
    await fireEvent.press(await findButton(ONBOARDING.later))

    expect(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })).toBeOnTheScreen()
    expect(JSON.parse(requests('post', '/auth/login')[0].data)).toMatchObject({ email: 'ana@um.edu.uy', password: 'secreto-123' })
    expect(JSON.parse(requests('put', '/users/me')[0].data)).toEqual({ onboardingCompleted: true })
    expect(requests('get', '/plans').at(-1).headers.get('Authorization')).toBe(`Bearer ${TOKENS.accessToken}`)
    // Los tokens quedan en el almacenamiento seguro del teléfono.
    expect(SecureStore.data.get('junte.refreshToken')).toBe(TOKENS.refreshToken)
  })

  it('credenciales incorrectas: muestra el texto del catálogo y se queda en el login', async () => {
    backgroundApi()
    api.onPost('/auth/login').reply(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', requestId: 'r-1' })
    await renderApp()

    await fireEvent.changeText(await screen.findByLabelText(LOGIN.email), 'ana@um.edu.uy')
    await fireEvent.changeText(screen.getByLabelText(LOGIN.password), 'otra-clave')
    await fireEvent.press(button(LOGIN.submit))

    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeOnTheScreen()
    expect(button(LOGIN.submit)).toBeOnTheScreen()
  })
})

describe('flujo: feed', () => {
  beforeEach(() => {
    backgroundApi()
    storedSession()
  })

  it('vacío: lo dice e invita a crear un plan', async () => {
    api.onGet('/plans').reply(200, page([]))
    await renderApp()

    expect(await screen.findByText(HOME.emptyTitle)).toBeOnTheScreen()
    expect(button(HOME.create)).toBeOnTheScreen()
  })

  it('error de la API: el texto del catálogo y "Reintentar" vuelve a pedir y muestra los planes', async () => {
    api.onGet('/plans').replyOnce(500, { code: 'INTERNAL', message: 'Ocurrió un error en el servidor. Probá más tarde.', requestId: 'r-500' })
    api.onGet('/plans').reply(200, page([plan()]))
    await renderApp()

    expect(await screen.findByText(HOME.errorTitle)).toBeOnTheScreen()
    expect(screen.getByText('Ocurrió un error en el servidor. Probá más tarde.')).toBeOnTheScreen()
    await fireEvent.press(button(HOME.retry))

    expect(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })).toBeOnTheScreen()
    expect(screen.queryByText(HOME.errorTitle)).not.toBeOnTheScreen()
  })

  it('refresco fallido sin red: conserva los planes visibles y deja reintentar', async () => {
    api.onGet('/plans').replyOnce(200, page([plan()]))
    api.onGet('/plans').networkErrorOnce()
    api.onGet('/plans').reply(200, page([plan({ id: 'p2', title: 'Cine en Punta Carretas' })]))
    await renderApp()
    await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })

    await act(async () => screen.getByTestId('feed-list').props.onRefresh())

    expect(await screen.findByText(HOME.refreshError)).toBeOnTheScreen()
    expect(screen.getByText(/No pudimos conectarnos/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: /Fútbol 5 en Parque Rodó/ })).toBeOnTheScreen()
    await fireEvent.press(button(HOME.retry))
    expect(await screen.findByRole('button', { name: /Cine en Punta Carretas/ })).toBeOnTheScreen()
  })

  it('paginación: la página siguiente se pide con el cursor de la anterior y se agrega abajo', async () => {
    api.onGet('/plans').reply((config) => (config.params?.cursor === 'c-1'
      ? [200, page([plan({ id: 'p2', title: 'Cine en Punta Carretas' })])]
      : [200, page([plan()], 'c-1')]))
    await renderApp()
    await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })

    await act(async () => screen.getByTestId('feed-list').props.onEndReached())

    expect(await screen.findByRole('button', { name: /Cine en Punta Carretas/ })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: /Fútbol 5 en Parque Rodó/ })).toBeOnTheScreen()
    expect(screen.getByText(HOME.end)).toBeOnTheScreen()
    expect(requests('get', '/plans').map((request) => request.params.cursor)).toEqual([undefined, 'c-1'])
  })
})

describe('flujo: detalle → inscribirse → darse de baja', () => {
  beforeEach(() => {
    backgroundApi()
    storedSession()
    api.onGet('/plans').reply(200, page([plan()]))
  })

  it('se inscribe, cancela la confirmación de baja (no se da de baja) y después confirma', async () => {
    let participation = null
    api.onGet('/plans/p1').reply(() => [200, plan(participation ? { myParticipation: participation, participantCount: 8, availableSpots: 2 } : {})])
    api.onPost('/plans/p1/join').reply(() => { participation = joined(); return [201, { planId: 'p1', status: 'active' }] })
    api.onDelete('/plans/p1/join').reply(() => { participation = null; return [204] })
    await renderApp()
    await openPlanFromFeed()

    await fireEvent.press(button(PLAN.join))
    expect(await screen.findByText(PLAN.joinedNotice)).toBeOnTheScreen()
    expect(screen.getByText('8 de 10')).toBeOnTheScreen()

    await fireEvent.press(button(PLAN.leave))
    expect(screen.getByText(PLAN.confirmLeaveHint)).toBeOnTheScreen()
    await fireEvent.press(button(PLAN.keepJoined))
    expect(requests('delete', '/plans/p1/join')).toHaveLength(0)
    expect(screen.getByText(PLAN.joinedNotice)).toBeOnTheScreen()

    await fireEvent.press(button(PLAN.leave))
    await fireEvent.press(button(PLAN.confirmLeave))

    expect(await findButton(PLAN.join)).toBeOnTheScreen()
    expect(screen.queryByText(PLAN.joinedNotice)).not.toBeOnTheScreen()
    expect(requests('delete', '/plans/p1/join')).toHaveLength(1)
    expect(screen.getByText('7 de 10')).toBeOnTheScreen()
  })

  it('el plan se llenó mientras lo miraba: explica PLAN_FULL y deja de ofrecer la inscripción', async () => {
    api.onGet('/plans/p1').replyOnce(200, plan())
    api.onGet('/plans/p1').reply(200, plan({ isFull: true, availableSpots: 0, participantCount: 10 }))
    api.onPost('/plans/p1/join').reply(409, { code: 'PLAN_FULL', message: 'Plan full', requestId: 'r-2' })
    await renderApp()
    await openPlanFromFeed()

    await fireEvent.press(button(PLAN.join))

    expect(await screen.findByText('El plan se llenó: ya no quedan lugares.')).toBeOnTheScreen()
    expect(await screen.findByText(PLAN.full)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PLAN.join })).not.toBeOnTheScreen()
  })

  it('error al cargar el detalle: texto del catálogo y "Reintentar" lo muestra', async () => {
    api.onGet('/plans/p1').networkErrorOnce()
    api.onGet('/plans/p1').reply(200, plan())
    await renderApp()
    await fireEvent.press(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ }))

    // Sin red el título dice "Sin conexión" (S6-MOB-05); el motivo es el texto del catálogo.
    expect(await screen.findByText(ERROR_STATE_TEXTS.offlineTitle)).toBeOnTheScreen()
    expect(screen.getByText(/No pudimos conectarnos/)).toBeOnTheScreen()
    await fireEvent.press(button(PLAN.retry))

    expect(await screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })).toBeOnTheScreen()
  })
})

describe('reglas que no se pueden romper (regresiones)', () => {
  beforeEach(() => {
    backgroundApi()
    storedSession()
  })

  it('con el plan lleno no se ofrece inscribirse (ni en el feed ni en el detalle)', async () => {
    const full = plan({ isFull: true, availableSpots: 0, participantCount: 10 })
    api.onGet('/plans').reply(200, page([full]))
    api.onGet('/plans/p1').reply(200, full)
    await renderApp()

    const card = await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })
    expect(within(card).getByText('Lleno')).toBeOnTheScreen()
    await openPlanFromFeed()

    expect(screen.getByText(PLAN.full)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: PLAN.join })).not.toBeOnTheScreen()
  })

  it('con cupo ilimitado se muestra "Sin límite de cupo" y se puede inscribir', async () => {
    const unlimited = plan({ capacity: null, availableSpots: null, participantCount: 40 })
    api.onGet('/plans').reply(200, page([unlimited]))
    api.onGet('/plans/p1').reply(200, unlimited)
    await renderApp()

    expect(await screen.findByText('Sin límite de cupo')).toBeOnTheScreen()
    await openPlanFromFeed()

    expect(screen.getByText('Sin límite de cupo')).toBeOnTheScreen()
    expect(screen.getByText('40')).toBeOnTheScreen()
    expect(button(PLAN.join)).toBeOnTheScreen()
  })

  it('el creador ve "Editar plan" y lo abre con su plan; otra persona no lo ve', async () => {
    const mine = plan({ isCreator: true, creator: { id: COMPLETE_USER.id, name: 'Ana', photoUrl: null, reputation: 0 } })
    api.onGet('/plans').reply(200, page([plan()]))
    api.onGet('/plans/p1').replyOnce(200, plan())
    api.onGet('/plans/p1').reply(200, mine)
    await renderApp()

    await openPlanFromFeed()
    expect(screen.queryByRole('button', { name: PLAN.edit })).not.toBeOnTheScreen()
    await goBack()

    await openPlanFromFeed()
    await fireEvent.press(await findButton(PLAN.edit))

    expect(await findButton(CREATE.save)).toBeOnTheScreen()
    expect(screen.getByLabelText(CREATE.title).props.value).toBe('Fútbol 5 en Parque Rodó')
  })
})

describe('navegación', () => {
  beforeEach(() => {
    backgroundApi()
    storedSession()
    api.onGet('/plans').reply(200, page([plan()]))
    api.onGet('/plans/p1').reply(200, plan({ myParticipation: joined() }))
    api.onGet('/plans/p1/messages').reply(200, page([]))
  })

  it('entrar al plan lo pide una sola vez; volver del chat lo refresca', async () => {
    await renderApp()
    await openPlanFromFeed()
    // El primer focus (el del montaje) no vuelve a pedir.
    await waitFor(() => expect(requests('get', '/plans/p1')).toHaveLength(1))

    await fireEvent.press(button(PLAN.chat))
    await screen.findByLabelText(CHAT.inputLabel)
    await goBack()

    await waitFor(() => expect(requests('get', '/plans/p1')).toHaveLength(2))
    expect(screen.getByRole('header', { name: 'Fútbol 5 en Parque Rodó' })).toBeOnTheScreen()
  })

  it('volver al feed desde el detalle no lo vuelve a cargar desde cero', async () => {
    await renderApp()
    await openPlanFromFeed()
    await goBack()

    expect(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ })).toBeOnTheScreen()
    expect(requests('get', '/plans')).toHaveLength(1)
  })

  // BUG-QA-1: un refresco "silencioso" del detalle (al volver del chat, del QR o del check-in) que falla por red
  // reemplaza todo el plan por la pantalla de error, aunque el plan ya se estaba viendo. En el feed y en Mis planes un
  // refresco fallido conserva los datos (`refreshError`). Esperado: el plan sigue a la vista.
  it('si el refresco al volver al plan falla por red, el plan sigue a la vista', async () => {
    // El primero (al entrar) responde; el refresco al volver, sin red. (Una función: el handler del beforeEach se pisa.)
    let calls = 0
    api.onGet('/plans/p1').reply(() => (++calls === 1 ? [200, plan({ myParticipation: joined() })] : Promise.reject(Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' }))))
    await renderApp()
    await openPlanFromFeed()
    await fireEvent.press(button(PLAN.chat))
    await screen.findByLabelText(CHAT.inputLabel)

    await goBack()
    await waitFor(() => expect(requests('get', '/plans/p1')).toHaveLength(2))

    await act(async () => {})
    expect(screen.queryByText(PLAN.errorTitle)).not.toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Fútbol 5 en Parque Rodó' })).toBeOnTheScreen()
  })
})

describe('flujo: crear un plan', () => {
  const startsAt = new Date(Date.now() + 2 * DAY_MS)
  const endsAt = new Date(startsAt.getTime() + 2 * HOUR_MS)
  // En iOS el selector queda abierto debajo del campo hasta que se vuelve a tocar el campo.
  const pickDate = async (label, date) => {
    if (!screen.queryByTestId(`${label}-picker`)) await fireEvent.press(button(label))
    await act(async () => screen.getByTestId(`${label}-picker`).props.onValueChange({}, date))
  }

  beforeEach(() => {
    backgroundApi()
    storedSession()
    api.onGet('/plans').reply(200, page([]))
  })

  it('valida en el teléfono, corrige y al crear abre el detalle del plan nuevo', async () => {
    api.onPost('/plans').reply((config) => [201, plan({ ...JSON.parse(config.data), id: 'nuevo', isCreator: true, participantCount: 0 })])
    api.onGet('/plans/nuevo').reply(() => [200, plan({ ...JSON.parse(requests('post', '/plans')[0].data), id: 'nuevo', isCreator: true, participantCount: 0, title: 'Picadito del viernes' })])
    await renderApp()
    await screen.findByText(HOME.emptyTitle)
    await fireEvent.press(screen.getByText(TAB_TITLES.create))

    await fireEvent.press(await findButton(CREATE.create))

    expect(screen.getByText(/El título necesita/)).toBeOnTheScreen()
    expect(screen.getByText('Marcá el lugar en el mapa.')).toBeOnTheScreen()
    expect(screen.getByText('Elegí al menos un tipo de actividad.')).toBeOnTheScreen()
    expect(requests('post', '/plans')).toHaveLength(0)

    await fireEvent.changeText(screen.getByLabelText(CREATE.title), 'Picadito del viernes')
    await pickDate(CREATE.startsAt, startsAt)
    // Termina antes de empezar: se rechaza en el teléfono.
    await pickDate(CREATE.endsAt, new Date(startsAt.getTime() - HOUR_MS))
    await fireEvent(screen.getByTestId('location-map'), 'press', { nativeEvent: { coordinate: { latitude: -34.913, longitude: -56.166 } } })
    await fireEvent.changeText(screen.getByLabelText(CREATE.locationLabel), 'Parque Rodó')
    await fireEvent.changeText(screen.getByLabelText(CREATE.capacity), '0')
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Fútbol' }))
    await fireEvent.press(button(CREATE.create))

    expect(screen.getByText('El plan tiene que terminar después de empezar.')).toBeOnTheScreen()
    expect(screen.getByText(/El cupo es un número entre 1 y 500/)).toBeOnTheScreen()
    expect(requests('post', '/plans')).toHaveLength(0)

    await pickDate(CREATE.endsAt, endsAt)
    await fireEvent.changeText(screen.getByLabelText(CREATE.capacity), '10')
    await fireEvent.press(button(CREATE.create))

    expect(await screen.findByRole('header', { name: 'Picadito del viernes' })).toBeOnTheScreen()
    expect(JSON.parse(requests('post', '/plans')[0].data)).toEqual({
      title: 'Picadito del viernes',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.166, -34.913] },
      capacity: 10,
      price: 0,
      interests: ['futbol']
    })
    expect(button(PLAN.edit)).toBeOnTheScreen()
  })

  it('PROFILE_INCOMPLETE del servidor: muestra el texto del catálogo y conserva lo cargado', async () => {
    api.onPost('/plans').reply(403, { code: 'PROFILE_INCOMPLETE', message: 'Profile incomplete', requestId: 'r-3' })
    await renderApp()
    await screen.findByText(HOME.emptyTitle)
    await fireEvent.press(screen.getByText(TAB_TITLES.create))
    await fireEvent.changeText(await screen.findByLabelText(CREATE.title), 'Picadito del viernes')
    await pickDate(CREATE.startsAt, startsAt)
    await pickDate(CREATE.endsAt, endsAt)
    await fireEvent(screen.getByTestId('location-map'), 'press', { nativeEvent: { coordinate: { latitude: -34.913, longitude: -56.166 } } })
    await fireEvent.changeText(screen.getByLabelText(CREATE.locationLabel), 'Parque Rodó')
    await fireEvent.changeText(screen.getByLabelText(CREATE.capacity), '10')
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Fútbol' }))

    await fireEvent.press(button(CREATE.create))

    expect(await screen.findByText(/Completá tu perfil \(nombre, fecha de nacimiento y al menos un interés\)/)).toBeOnTheScreen()
    expect(screen.getByLabelText(CREATE.title).props.value).toBe('Picadito del viernes')
  })
})

describe('flujo: chat sin WebSocket (por REST)', () => {
  beforeEach(() => {
    backgroundApi()
    storedSession()
    api.onGet('/plans').reply(200, page([plan()]))
    api.onGet('/plans/p1').reply(200, plan({ myParticipation: joined() }))
    api.onGet('/plans/p1/messages').reply(200, page([]))
  })

  async function openChat () {
    await renderApp()
    await openPlanFromFeed()
    await fireEvent.press(button(PLAN.chat))
    return screen.findByLabelText(CHAT.inputLabel)
  }

  it('enviar queda "Enviando…" y al confirmarse muestra la hora', async () => {
    const pending = deferred()
    api.onPost('/plans/p1/messages').reply(() => pending.promise)
    await openChat()

    await fireEvent.changeText(screen.getByLabelText(CHAT.inputLabel), 'Hola, ¿llevo pelota?')
    await fireEvent.press(button(CHAT.send))

    expect(await screen.findByText(CHAT.sending)).toBeOnTheScreen()
    const { clientId } = JSON.parse(requests('post', '/plans/p1/messages')[0].data)
    await act(async () => pending.resolve([201, { id: 'm1', planId: 'p1', sender: ME, type: 'text', text: 'Hola, ¿llevo pelota?', clientId, createdAt: todayAt(10, 5) }]))

    expect(await screen.findByText('10:05')).toBeOnTheScreen()
    expect(screen.queryByText(CHAT.sending)).not.toBeOnTheScreen()
    expect(screen.getAllByText('Hola, ¿llevo pelota?')).toHaveLength(1)
  })

  // Un error de red no llega acá: el mensaje queda en la cola de pendientes (S6-MOB-02, lo cubre useChat.test.js).
  it('si el servidor lo rechaza queda "No se envió · Reintentar"; reintentar lo manda con el mismo clientId', async () => {
    api.onPost('/plans/p1/messages').replyOnce(500, { code: 'INTERNAL_ERROR', message: 'Error interno.', requestId: 'req-1' })
    api.onPost('/plans/p1/messages').reply((config) => [201, { id: 'm1', planId: 'p1', sender: ME, type: 'text', text: 'Hola', clientId: JSON.parse(config.data).clientId, createdAt: todayAt(10, 6) }])
    await openChat()

    await fireEvent.changeText(screen.getByLabelText(CHAT.inputLabel), 'Hola')
    await fireEvent.press(button(CHAT.send))

    expect(await screen.findByText(`${CHAT.notSent} · ${CHAT.retrySend}`)).toBeOnTheScreen()
    await fireEvent.press(button(`${CHAT.notSent}. ${CHAT.retrySend}`))

    expect(await screen.findByText('10:06')).toBeOnTheScreen()
    expect(screen.queryByText(`${CHAT.notSent} · ${CHAT.retrySend}`)).not.toBeOnTheScreen()
    const [first, second] = requests('post', '/plans/p1/messages').map((request) => JSON.parse(request.data).clientId)
    expect(second).toBe(first)
  })
})
