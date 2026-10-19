import { act, fireEvent, screen, within } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { TEXTS as FILTERS } from '../components/FeedFilters.jsx'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { resetFilterOptionsCache } from '../hooks/useFeedFilters.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getFeed } from '../services/api/feed.js'
import { getPlanFilters, listPlans } from '../services/api/plans.js'
import { readBusySlots } from '../services/calendar.js'
import { getCurrentCoordinates } from '../services/location.js'
import HomeScreen, { TEXTS } from './HomeScreen.jsx'

jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/feed.js', () => ({ getFeed: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ listPlans: jest.fn(), getPlanFilters: jest.fn() }))
jest.mock('../services/calendar.js', () => ({ readBusySlots: jest.fn() }))
jest.mock('../services/location.js', () => ({ ...jest.requireActual('../services/location.js'), getCurrentCoordinates: jest.fn() }))

const NEAR = [-56.1645, -34.9011]
const navigation = { navigate: jest.fn() }

// Fechas con la hora local del teléfono (así el texto de la tarjeta no depende de la zona del CI).
const plan = (id, overrides = {}) => ({
  id,
  title: `Plan ${id}`,
  startsAt: new Date(2026, 9, 25, 18).toISOString(),
  endsAt: new Date(2026, 9, 25, 20).toISOString(),
  location: { label: 'Parque Rodó', type: 'Point', coordinates: NEAR },
  capacity: 10,
  availableSpots: 3,
  isFull: false,
  price: 0,
  ...overrides
})
const page = (plans, nextCursor = null) => ({ items: plans, nextCursor })

const withLocation = () => getCurrentCoordinates.mockResolvedValue({ status: 'granted', coordinates: NEAR })
const withoutLocation = (status = 'denied') => getCurrentCoordinates.mockResolvedValue({ status, coordinates: null })

async function renderHome () {
  const service = createFakeAuthService({ user: COMPLETE_USER })
  const view = await renderWithAuth(<SignedIn><HomeScreen navigation={navigation} /></SignedIn>, { service })
  await screen.findByRole('button', { name: TEXTS.filters })
  return view
}

const lastFeedBody = () => getFeed.mock.calls.at(-1)[0]

describe('HomeScreen (feed)', () => {
  beforeEach(() => {
    navigation.navigate.mockReset()
    resetCatalogsCache()
    resetFilterOptionsCache()
    getCatalogs.mockReset().mockResolvedValue(CATALOG)
    getPlanFilters.mockReset().mockResolvedValue({
      priceRanges: [{ key: 'free', min: 0, max: 0 }, { key: 'low', min: 1, max: 500 }, { key: 'high', min: 1001, max: null }],
      radiusKm: { min: 0.5, max: 50, default: 10 }
    })
    getFeed.mockReset()
    listPlans.mockReset()
    readBusySlots.mockReset().mockResolvedValue(null)
    getCurrentCoordinates.mockReset()
  })

  describe('los cuatro estados', () => {
    it('cargando', async () => {
      withLocation()
      const pending = deferred()
      getFeed.mockReturnValue(pending.promise)

      await renderHome()

      expect(screen.getByText(TEXTS.loading)).toBeOnTheScreen()
      await act(async () => pending.resolve(page([])))
    })

    it('vacío: explica qué probar', async () => {
      withLocation()
      getFeed.mockResolvedValue(page([]))

      await renderHome()

      expect(await screen.findByText(TEXTS.emptyTitle)).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.emptyNearby)).toBeOnTheScreen()
    })

    it('error: muestra el mensaje y permite reintentar', async () => {
      withLocation()
      getFeed.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(page([plan('a')]))

      await renderHome()
      expect(await screen.findByText('Sin conexión')).toBeOnTheScreen()
      expect(screen.getByText(/No pudimos conectarnos/)).toBeOnTheScreen()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

      expect(await screen.findByText('Plan a')).toBeOnTheScreen()
      expect(screen.queryByText('Sin conexión')).not.toBeOnTheScreen()
    })

    it('error del servidor: dice qué no se pudo cargar', async () => {
      withLocation()
      getFeed.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' }))

      await renderHome()

      expect(await screen.findByText(TEXTS.errorTitle)).toBeOnTheScreen()
      expect(screen.getByRole('button', { name: TEXTS.retry })).toBeOnTheScreen()
    })

    it('con datos: una tarjeta por plan con fecha, lugar, distancia, costo y cupo', async () => {
      withLocation()
      getFeed.mockResolvedValue(page([
        plan('a', { distanceMeters: 2440, price: 1500 }),
        plan('b', { capacity: null, availableSpots: null })
      ]))

      await renderHome()

      const first = await screen.findByRole('button', { name: /Plan a/ })
      expect(within(first).getByText('dom 25/10 · 18:00 a 20:00')).toBeOnTheScreen()
      expect(within(first).getByText('Parque Rodó · a 2,4 km')).toBeOnTheScreen()
      expect(within(first).getByText('$ 1.500')).toBeOnTheScreen()
      expect(within(first).getByText('Quedan 3 lugares')).toBeOnTheScreen()
      const second = screen.getByRole('button', { name: /Plan b/ })
      expect(within(second).getByText('Gratis')).toBeOnTheScreen()
      expect(within(second).getByText('Sin límite de cupo')).toBeOnTheScreen()
    })
  })

  it('tocar una tarjeta abre el detalle de ese plan', async () => {
    withLocation()
    getFeed.mockResolvedValue(page([plan('a'), plan('b')]))
    await renderHome()

    await fireEvent.press(await screen.findByRole('button', { name: /Plan b/ }))

    expect(navigation.navigate).toHaveBeenCalledWith('Plan', { planId: 'b' })
  })

  describe('ubicación y calendario', () => {
    it('con ubicación pide el feed cercano con el radio por defecto y las franjas del calendario', async () => {
      withLocation()
      const calendar = { from: 'a', to: 'b', busy: [{ start: 'c', end: 'd' }] }
      readBusySlots.mockResolvedValue(calendar)
      getFeed.mockResolvedValue(page([plan('a')]))

      await renderHome()
      await screen.findByText('Plan a')

      expect(lastFeedBody()).toEqual({ availability: 'available', near: NEAR, radiusKm: 10, limit: 20, calendar })
      expect(listPlans).not.toHaveBeenCalled()
    })

    it('sin permiso de ubicación lista por fecha y lo explica', async () => {
      withoutLocation('denied')
      listPlans.mockResolvedValue(page([plan('a')]))

      await renderHome()

      expect(await screen.findByText('Plan a')).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.locationDenied)).toBeOnTheScreen()
      expect(getFeed).not.toHaveBeenCalled()
    })

    it('con permiso pero sin posición lista por fecha con otro aviso', async () => {
      withoutLocation('unavailable')
      listPlans.mockResolvedValue(page([]))

      await renderHome()

      expect(await screen.findByText(TEXTS.locationUnavailable)).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.emptyByDate)).toBeOnTheScreen()
    })
  })

  describe('scroll infinito y pull-to-refresh', () => {
    it('al llegar al final carga la página siguiente con nextCursor y la agrega', async () => {
      withLocation()
      getFeed.mockResolvedValueOnce(page([plan('a')], 'cursor-1')).mockResolvedValueOnce(page([plan('b')]))
      await renderHome()
      await screen.findByText('Plan a')

      await act(async () => screen.getByTestId('feed-list').props.onEndReached())

      expect(await screen.findByText('Plan b')).toBeOnTheScreen()
      expect(screen.getByText('Plan a')).toBeOnTheScreen()
      expect(lastFeedBody().cursor).toBe('cursor-1')
      expect(screen.getByText(TEXTS.end)).toBeOnTheScreen()
    })

    it('si falla cargar más lo avisa al pie y deja reintentar', async () => {
      withLocation()
      getFeed
        .mockResolvedValueOnce(page([plan('a')], 'cursor-1'))
        .mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' }))
        .mockResolvedValueOnce(page([plan('b')]))
      await renderHome()
      await screen.findByText('Plan a')

      await act(async () => screen.getByTestId('feed-list').props.onEndReached())
      expect(await screen.findByText(new RegExp(TEXTS.loadMoreError))).toBeOnTheScreen()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

      expect(await screen.findByText('Plan b')).toBeOnTheScreen()
    })

    it('tirar para refrescar vuelve a pedir la primera página', async () => {
      withLocation()
      getFeed.mockResolvedValueOnce(page([plan('a')], 'cursor-1')).mockResolvedValueOnce(page([plan('z')]))
      await renderHome()
      await screen.findByText('Plan a')

      await act(async () => screen.getByTestId('feed-list').props.onRefresh())

      expect(await screen.findByText('Plan z')).toBeOnTheScreen()
      expect(screen.queryByText('Plan a')).not.toBeOnTheScreen()
      expect(lastFeedBody()).not.toHaveProperty('cursor')
    })
  })

  describe('secciones y filtros', () => {
    it('la sección "Llenos" pide availability=full y avisa que no admiten inscripciones', async () => {
      withLocation()
      getFeed.mockResolvedValueOnce(page([plan('a')])).mockResolvedValueOnce(page([plan('lleno', { isFull: true, availableSpots: 0 })]))
      await renderHome()
      await screen.findByText('Plan a')

      await fireEvent.press(screen.getByRole('radio', { name: TEXTS.full }))

      const card = await screen.findByRole('button', { name: /Plan lleno/ })
      expect(within(card).getByText('Lleno')).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.fullHint)).toBeOnTheScreen()
      expect(lastFeedBody().availability).toBe('full')
      expect(screen.getByRole('radio', { name: TEXTS.full })).toBeChecked()
    })

    it('el panel de filtros muestra radio, fecha, costo (rangos del back) y tipo de actividad', async () => {
      withLocation()
      getFeed.mockResolvedValue(page([]))
      await renderHome()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.filters }))

      for (const label of ['500 m', '1 km', '2 km', '5 km', '10 km', '25 km', '50 km']) expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen()
      expect(screen.getByRole('radio', { name: '10 km' })).toBeChecked()
      expect(screen.getByRole('radio', { name: 'Próximos 7 días' })).toBeOnTheScreen()
      expect(screen.getByRole('checkbox', { name: 'Gratis' })).toBeOnTheScreen()
      expect(screen.getByRole('checkbox', { name: '$ 1 a $ 500' })).toBeOnTheScreen()
      expect(screen.getByRole('checkbox', { name: 'Más de $ 1.000' })).toBeOnTheScreen()
      expect(await screen.findByRole('checkbox', { name: 'Fútbol' })).toBeOnTheScreen()
    })

    it('elegir radio, varios rangos de precio, fecha e intereses vuelve a pedir el feed con esos valores', async () => {
      withLocation()
      getFeed.mockResolvedValue(page([]))
      await renderHome()
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.filters }))

      await fireEvent.press(screen.getByRole('radio', { name: '2 km' }))
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Gratis' }))
      await fireEvent.press(screen.getByRole('checkbox', { name: '$ 1 a $ 500' }))
      await fireEvent.press(screen.getByRole('radio', { name: 'Hoy' }))
      await fireEvent.press(await screen.findByRole('checkbox', { name: 'Cine' }))
      await fireEvent.press(screen.getByRole('button', { name: FILTERS.apply }))

      await screen.findByRole('button', { name: `${TEXTS.filters} (4)` })
      expect(lastFeedBody()).toEqual({
        availability: 'available', near: NEAR, radiusKm: 2, limit: 20, priceRanges: ['free', 'low'], interests: ['cine'], to: expect.any(String)
      })
    })

    it('"Limpiar filtros" vuelve al feed sin filtros', async () => {
      withLocation()
      getFeed.mockResolvedValue(page([]))
      await renderHome()
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.filters }))
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Gratis' }))

      await fireEvent.press(screen.getByRole('button', { name: FILTERS.reset }))
      await fireEvent.press(screen.getByRole('button', { name: FILTERS.apply }))

      await screen.findByRole('button', { name: TEXTS.filters })
      expect(lastFeedBody()).toEqual({ availability: 'available', near: NEAR, radiusKm: 10, limit: 20 })
    })
  })
})
