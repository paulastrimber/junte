// Cuántas requests salen al navegar, con React Navigation real (los tests de pantalla usan una navegación falsa y no
// ven el `focus` que se emite al montar). Es la regresión de la doble carga al entrar a una pantalla y de los
// refrescos de más al volver a la app.
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { act, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { CATALOG, COMPLETE_USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { resetFilterOptionsCache } from '../hooks/useFeedFilters.js'
import { TEXTS as HOME } from '../screens/HomeScreen.jsx'
import { getCatalogs } from '../services/api/catalogs.js'
import { listParticipants } from '../services/api/participations.js'
import { getPlan, getPlanFilters, listMyPlans, listPlans } from '../services/api/plans.js'
import * as usersApi from '../services/api/users.js'
import { RootNavigator } from './RootNavigator.jsx'
import { ROUTES } from './routes.js'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({
  listPlans: jest.fn(), listMyPlans: jest.fn(), getPlan: jest.fn(), createPlan: jest.fn(), updatePlan: jest.fn(), getPlanFilters: jest.fn(), createPlanQr: jest.fn()
}))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))
jest.mock('../services/api/feed.js', () => ({ getFeed: jest.fn() }))

const PLAN = Object.freeze({
  id: 'p1',
  title: 'Fútbol 5',
  description: '',
  startsAt: '2027-01-01T18:00:00.000Z',
  endsAt: '2027-01-01T20:00:00.000Z',
  location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.16, -34.91] },
  interests: [],
  university: 'um',
  capacity: 10,
  participantCount: 2,
  availableSpots: 8,
  isFull: false,
  price: 0,
  status: 'open',
  photoUrl: null,
  creator: { id: 'u2', name: 'Lucía', photoUrl: null, reputation: 1 },
  isCreator: false,
  checkInOpensAt: '2027-01-01T17:45:00.000Z',
  checkInClosesAt: '2027-01-01T19:00:00.000Z',
  checkInRadiusMeters: 150,
  myParticipation: { status: 'active' }
})

// Deja correr las respuestas (ya resueltas) y los efectos que disparan.
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)))

describe('requests al navegar (React Navigation real)', () => {
  let appStateHandlers
  const emitAppState = (...states) => act(async () => {
    for (const state of states) appStateHandlers.forEach((handler) => handler(state))
  })

  beforeEach(() => {
    resetCatalogsCache()
    resetFilterOptionsCache()
    getCatalogs.mockResolvedValue(CATALOG)
    usersApi.getMe.mockResolvedValue({ reputation: 0, noShowCount: 0 })
    listMyPlans.mockResolvedValue({ items: [], nextCursor: null })
    getPlanFilters.mockResolvedValue({ priceRanges: [] })
    listPlans.mockResolvedValue({ items: [], nextCursor: null })
    getPlan.mockResolvedValue(PLAN)
    listParticipants.mockResolvedValue({ items: [], nextCursor: null })
    appStateHandlers = new Set()
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') appStateHandlers.add(handler)
      return { remove: () => appStateHandlers.delete(handler) }
    })
  })

  afterEach(() => jest.restoreAllMocks())

  async function renderApp () {
    const ref = createNavigationContainerRef()
    await renderWithAuth(<NavigationContainer ref={ref}><RootNavigator /></NavigationContainer>, { service: createFakeAuthService({ user: COMPLETE_USER }) })
    await screen.findByRole('button', { name: HOME.filters })
    return ref
  }

  it('entrar a una pantalla pide sus datos una vez, y volver a ella una vez más', async () => {
    const ref = await renderApp()
    expect(listPlans).toHaveBeenCalledTimes(1)

    await act(async () => ref.navigate(ROUTES.MY_PLANS_TAB))
    await settle()
    expect(listMyPlans).toHaveBeenCalledTimes(1)

    await act(async () => ref.navigate(ROUTES.FEED_TAB))
    await act(async () => ref.navigate(ROUTES.MY_PLANS_TAB))
    await settle()
    expect(listMyPlans).toHaveBeenCalledTimes(2)

    await act(async () => ref.navigate(ROUTES.FEED_TAB))
    await act(async () => ref.navigate(ROUTES.PLAN, { planId: 'p1' }))
    await settle()
    expect(getPlan).toHaveBeenCalledTimes(1)
    expect(listParticipants).toHaveBeenCalledTimes(1)
  })

  it('con dos detalles abiertos, volver a la app refresca solo el que está a la vista, y un "inactive" no refresca', async () => {
    const ref = await renderApp()
    await act(async () => ref.navigate(ROUTES.PLAN, { planId: 'p1' }))
    await settle()
    // Otro detalle en el stack de "Mis planes": dos PlanScreen montadas a la vez, una sola a la vista.
    await act(async () => ref.navigate(ROUTES.MY_PLANS_TAB, { screen: ROUTES.PLAN, params: { planId: 'p1' } }))
    await settle()
    // Uno por cada detalle, más el de la sincronización de la cola de pendientes (useOfflineSync).
    expect(appStateHandlers.size).toBe(3)
    const plansBefore = getPlan.mock.calls.length
    const participantsBefore = listParticipants.mock.calls.length

    // iOS: centro de control o un diálogo de permisos, sin pasar por segundo plano.
    await emitAppState('inactive', 'active')
    await settle()
    expect(getPlan).toHaveBeenCalledTimes(plansBefore)

    await emitAppState('background', 'active')
    await settle()
    expect(getPlan).toHaveBeenCalledTimes(plansBefore + 1)
    // Con el plan se refrescan los anotados (el cupo y la lista quedan coherentes).
    expect(listParticipants).toHaveBeenCalledTimes(participantsBefore + 1)
  })
})
