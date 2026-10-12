import { Camera } from 'expo-camera'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth, CATALOG } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { checkIn, createPlanQr } from '../services/api/checkins.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMyPlans } from '../services/api/plans.js'
import * as usersApi from '../services/api/users.js'
import { LOCATION_STATUS, getPreciseLocation } from '../services/location.js'
import CheckInScreen, { TEXTS as CHECK_IN } from './CheckInScreen.jsx'
import MyPlansScreen, { TEXTS as MY_PLANS } from './MyPlansScreen.jsx'
import PlanQrScreen, { TEXTS as QR } from './PlanQrScreen.jsx'
import ProfileScreen, { TEXTS as PROFILE } from './ProfileScreen.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/checkins.js', () => ({ checkIn: jest.fn(), createPlanQr: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ listMyPlans: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))
jest.mock('../services/location.js', () => ({
  LOCATION_STATUS: { GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' },
  getPreciseLocation: jest.fn()
}))

const HERE = { status: LOCATION_STATUS.GRANTED, latitude: -34.9, longitude: -56.16, accuracyMeters: 12 }
const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => () => {}) }
const route = (params = {}) => ({ params: { planId: 'p1', ...params } })
const button = (name) => screen.getByRole('button', { name })
const apiError = (status, code, message) => new ApiError({ status, code, message, requestId: 'r1' })

beforeEach(() => {
  jest.resetAllMocks()
  navigation.addListener.mockImplementation(() => () => {})
})

describe('CheckInScreen', () => {
  const grantCamera = () => Camera.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' })
  const scan = (data) => fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', { data })

  it('pide la cámara al entrar y, con permiso, muestra el lector', async () => {
    grantCamera()

    await render(<CheckInScreen navigation={navigation} route={route()} />)

    expect(await screen.findByTestId('qr-camera')).toBeOnTheScreen()
    expect(screen.getByText(CHECK_IN.scanHint)).toBeOnTheScreen()
  })

  it('sin permiso de cámara lo explica y deja reintentar', async () => {
    Camera.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' }).mockResolvedValueOnce({ status: 'granted' })
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    expect(await screen.findByText(CHECK_IN.cameraDenied)).toBeOnTheScreen()
    expect(screen.queryByTestId('qr-camera')).not.toBeOnTheScreen()

    await fireEvent.press(button(CHECK_IN.retryCamera))

    expect(await screen.findByTestId('qr-camera')).toBeOnTheScreen()
  })

  it('al leer el QR manda la asistencia con la ubicación y confirma', async () => {
    grantCamera()
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockResolvedValue({ planId: 'p1', method: 'qr-location', distanceMeters: 8 })
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    await screen.findByTestId('qr-camera')

    await scan('p1.token')

    expect(await screen.findByRole('header', { name: CHECK_IN.doneTitle })).toBeOnTheScreen()
    expect(checkIn).toHaveBeenCalledWith('p1', { qrToken: 'p1.token', latitude: -34.9, longitude: -56.16, accuracyMeters: 12 })

    await fireEvent.press(button(CHECK_IN.back))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('mientras obtiene la ubicación y espera al servidor muestra el progreso', async () => {
    grantCamera()
    const location = deferred()
    const response = deferred()
    getPreciseLocation.mockReturnValue(location.promise)
    checkIn.mockReturnValue(response.promise)
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    await screen.findByTestId('qr-camera')

    await scan('p1.token')
    expect(await screen.findByText(CHECK_IN.locating)).toBeOnTheScreen()

    await act(async () => location.resolve(HERE))
    expect(await screen.findByText(CHECK_IN.sending)).toBeOnTheScreen()

    await act(async () => response.resolve({}))
    expect(await screen.findByText(CHECK_IN.doneMessage)).toBeOnTheScreen()
  })

  it.each([
    ['fuera de radio', apiError(403, 'OUT_OF_RANGE', 'Estás demasiado lejos del lugar del plan'), /demasiado lejos/],
    ['QR vencido', apiError(403, 'QR_INVALID'), /QR actual/]
  ])('%s: explica el rechazo y deja escanear de nuevo', async (_label, error, message) => {
    grantCamera()
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockRejectedValueOnce(error).mockResolvedValueOnce({})
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    await screen.findByTestId('qr-camera')

    await scan('p1.token')
    expect(await screen.findByText(message)).toBeOnTheScreen()

    await fireEvent.press(button(CHECK_IN.scanAgain))
    await scan('p1.token-nuevo')

    expect(await screen.findByText(CHECK_IN.doneMessage)).toBeOnTheScreen()
  })

  it('fuera de horario: lo explica y solo permite volver (reintentar no sirve)', async () => {
    grantCamera()
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockRejectedValue(apiError(409, 'CHECKIN_WINDOW_CLOSED'))
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    await screen.findByTestId('qr-camera')

    await scan('p1.token')

    expect(await screen.findByText(/Fuera de horario/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: CHECK_IN.scanAgain })).not.toBeOnTheScreen()
    expect(button(CHECK_IN.back)).toBeOnTheScreen()
  })

  it('sin permiso de ubicación lo explica y no llama al servidor', async () => {
    grantCamera()
    getPreciseLocation.mockResolvedValue({ status: LOCATION_STATUS.DENIED })
    await render(<CheckInScreen navigation={navigation} route={route()} />)
    await screen.findByTestId('qr-camera')

    await scan('p1.token')

    expect(await screen.findByText(/necesitamos tu ubicación/)).toBeOnTheScreen()
    expect(checkIn).not.toHaveBeenCalled()
  })
})

describe('PlanQrScreen (creador)', () => {
  const NOW = new Date('2026-10-25T21:00:00.000Z')
  const qr = (n) => ({ qrToken: `p1.token-${n}`, expiresAt: new Date(NOW.getTime() + 90_000).toISOString() })

  beforeEach(() => jest.useFakeTimers({ now: NOW }))
  afterEach(() => jest.useRealTimers())

  it('muestra el QR vigente y lo cambia solo antes de que venza', async () => {
    createPlanQr.mockResolvedValueOnce(qr(1)).mockResolvedValueOnce(qr(2))
    await render(<PlanQrScreen navigation={navigation} route={route()} />)

    expect(await screen.findByLabelText('p1.token-1')).toBeOnTheScreen()
    expect(screen.getByText(QR.hint)).toBeOnTheScreen()

    await act(async () => jest.advanceTimersByTime(75_000))

    expect(await screen.findByLabelText('p1.token-2')).toBeOnTheScreen()
    expect(screen.queryByLabelText('p1.token-1')).not.toBeOnTheScreen()
  })

  it('fuera del horario de asistencia lo explica, sin QR ni reintento', async () => {
    createPlanQr.mockRejectedValue(apiError(409, 'CHECKIN_WINDOW_CLOSED'))

    await render(<PlanQrScreen navigation={navigation} route={route({ canCheckIn: true })} />)

    expect(await screen.findByText(/horario de asistencia/)).toBeOnTheScreen()
    expect(screen.queryByTestId('qr-code')).not.toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: QR.retry })).not.toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: QR.myCheckIn })).not.toBeOnTheScreen()
  })

  it('si falla por red permite reintentar', async () => {
    createPlanQr.mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)).mockResolvedValueOnce(qr(1))
    await render(<PlanQrScreen navigation={navigation} route={route()} />)

    await fireEvent.press(await screen.findByRole('button', { name: QR.retry }))

    expect(await screen.findByLabelText('p1.token-1')).toBeOnTheScreen()
  })

  it('el creador inscripto registra su asistencia con la ubicación, sin QR', async () => {
    createPlanQr.mockResolvedValue(qr(1))
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockResolvedValue({ method: 'location' })
    await render(<PlanQrScreen navigation={navigation} route={route({ canCheckIn: true })} />)
    await screen.findByLabelText('p1.token-1')
    expect(screen.getByText(QR.myCheckInHint)).toBeOnTheScreen()

    await fireEvent.press(button(QR.myCheckIn))

    expect(await screen.findByText(QR.myCheckInDone)).toBeOnTheScreen()
    expect(checkIn).toHaveBeenCalledWith('p1', { latitude: -34.9, longitude: -56.16, accuracyMeters: 12 })
  })

  it('si su asistencia es rechazada, muestra el motivo y puede volver a intentar', async () => {
    createPlanQr.mockResolvedValue(qr(1))
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockRejectedValue(apiError(403, 'OUT_OF_RANGE', 'Estás demasiado lejos del lugar del plan'))
    await render(<PlanQrScreen navigation={navigation} route={route({ canCheckIn: true })} />)
    await screen.findByLabelText('p1.token-1')

    await fireEvent.press(button(QR.myCheckIn))

    expect(await screen.findByText(/demasiado lejos/)).toBeOnTheScreen()
    expect(button(QR.myCheckIn)).toBeOnTheScreen()
  })

  it('un creador que no está inscripto no ve la opción de registrar su asistencia', async () => {
    createPlanQr.mockResolvedValue(qr(1))

    await render(<PlanQrScreen navigation={navigation} route={route()} />)
    await screen.findByLabelText('p1.token-1')

    expect(screen.queryByRole('button', { name: QR.myCheckIn })).not.toBeOnTheScreen()
  })
})

describe('MyPlansScreen', () => {
  const plan = (overrides = {}) => ({
    id: 'p1',
    title: 'Fútbol 5 en Parque Rodó',
    startsAt: new Date(2026, 9, 25, 18).toISOString(),
    endsAt: new Date(2026, 9, 25, 20).toISOString(),
    location: { label: 'Parque Rodó' },
    price: 0,
    capacity: 10,
    availableSpots: 3,
    isFull: false,
    status: 'open',
    myParticipation: { status: 'active', checkedInAt: null, noShow: false },
    ...overrides
  })
  const page = (items, nextCursor = null) => ({ items, nextCursor })

  it('arranca en los planes a los que voy (próximos) y abre el detalle al tocar uno', async () => {
    listMyPlans.mockResolvedValue(page([plan()]))
    await render(<MyPlansScreen navigation={navigation} />)

    await fireEvent.press(await screen.findByRole('button', { name: /Fútbol 5 en Parque Rodó/ }))

    expect(listMyPlans).toHaveBeenCalledWith({ role: 'joined', when: 'upcoming', limit: 20 })
    expect(screen.getByText(MY_PLANS.joined)).toBeOnTheScreen()
    expect(navigation.navigate).toHaveBeenCalledWith('Plan', { planId: 'p1' })
  })

  it('cambiar a "Organizo" y a "Pasados" vuelve a pedir la lista', async () => {
    listMyPlans.mockResolvedValue(page([]))
    await render(<MyPlansScreen navigation={navigation} />)
    await screen.findByText(MY_PLANS.empty['joined-upcoming'])

    await fireEvent.press(screen.getByRole('radio', { name: 'Organizo' }))
    await fireEvent.press(await screen.findByRole('radio', { name: 'Pasados' }))

    await waitFor(() => expect(listMyPlans).toHaveBeenLastCalledWith({ role: 'created', when: 'past', limit: 20 }))
    expect(await screen.findByText(MY_PLANS.empty['created-past'])).toBeOnTheScreen()
  })

  it('en los pasados muestra si asistió o no, y el estado del plan', async () => {
    listMyPlans.mockResolvedValue(page([
      plan({ id: 'a', title: 'Fui', status: 'completed', myParticipation: { status: 'active', checkedInAt: '2026-10-25T21:00:00.000Z', noShow: false } }),
      plan({ id: 'b', title: 'Falté', status: 'completed', myParticipation: { status: 'active', checkedInAt: null, noShow: true } }),
      plan({ id: 'c', title: 'Se canceló', status: 'cancelled' })
    ]))

    await render(<MyPlansScreen navigation={navigation} />)

    expect(await screen.findByText(`${MY_PLANS.statusLabels.completed} · ${MY_PLANS.checkedIn}`)).toBeOnTheScreen()
    expect(screen.getByText(`${MY_PLANS.statusLabels.completed} · ${MY_PLANS.noShow}`)).toBeOnTheScreen()
    expect(screen.getByText(MY_PLANS.statusLabels.cancelled)).toBeOnTheScreen()
  })

  it('cargando, y error con reintento', async () => {
    const pending = deferred()
    listMyPlans.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([plan()]))
    await render(<MyPlansScreen navigation={navigation} />)
    expect(screen.getByText(MY_PLANS.loading)).toBeOnTheScreen()

    await act(async () => pending.reject(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)))
    expect(await screen.findByText(MY_PLANS.errorTitle)).toBeOnTheScreen()

    await fireEvent.press(button(MY_PLANS.retry))

    expect(await screen.findByText('Fútbol 5 en Parque Rodó')).toBeOnTheScreen()
  })

  it('al volver a la pestaña (foco) refresca la lista', async () => {
    listMyPlans.mockResolvedValue(page([plan()]))
    await render(<MyPlansScreen navigation={navigation} />)
    await screen.findByText('Fútbol 5 en Parque Rodó')
    const onFocus = navigation.addListener.mock.calls.filter(([event]) => event === 'focus').at(-1)[1]

    await act(async () => onFocus())

    await waitFor(() => expect(listMyPlans).toHaveBeenCalledTimes(2))
  })
})

describe('ProfileScreen: reputación y ausencias', () => {
  async function renderProfile (me) {
    resetCatalogsCache()
    getCatalogs.mockResolvedValue(CATALOG)
    usersApi.getMe.mockResolvedValue(me)
    const service = createFakeAuthService({ user: { ...COMPLETE_USER, reputation: 1 } })
    await renderWithAuth(<SignedIn><ProfileScreen navigation={navigation} /></SignedIn>, { service })
    await screen.findByRole('button', { name: PROFILE.save })
  }

  it('muestra la reputación y las ausencias que informa el servidor', async () => {
    await renderProfile({ ...COMPLETE_USER, reputation: 4, noShowCount: 1 })

    expect(await screen.findByText(`${PROFILE.reputation}: 4 asistencias`)).toBeOnTheScreen()
    expect(screen.getByText(`${PROFILE.noShows}: 1 ausencia`)).toBeOnTheScreen()
  })

  it('sin ausencias lo dice', async () => {
    await renderProfile({ ...COMPLETE_USER, reputation: 1, noShowCount: 0 })

    expect(await screen.findByText(`${PROFILE.noShows}: Sin ausencias`)).toBeOnTheScreen()
    expect(screen.getByText(`${PROFILE.reputation}: 1 asistencia`)).toBeOnTheScreen()
  })
})
