import { act, fireEvent, screen } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getPlan } from '../services/api/plans.js'
import PlanScreen, { TEXTS } from './PlanScreen.jsx'

jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ getPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))

// `addListener('focus', …)` devuelve la función para dejar de escuchar, como React Navigation.
const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => () => {}) }

const PLAN = Object.freeze({
  id: 'p1',
  title: 'Fútbol 5 en Parque Rodó',
  description: 'Traer camiseta clara y oscura.',
  startsAt: new Date(2026, 9, 25, 18).toISOString(),
  endsAt: new Date(2026, 9, 25, 20).toISOString(),
  location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.166, -34.913] },
  interests: ['futbol', 'cine'],
  university: 'um',
  capacity: 10,
  participantCount: 7,
  availableSpots: 3,
  isFull: false,
  price: 150,
  status: 'open',
  photoUrl: null,
  creator: { id: 'u2', name: 'Lucía Pérez', photoUrl: null, reputation: 3 },
  isCreator: false,
  checkInOpensAt: new Date(2026, 9, 25, 17, 45).toISOString(),
  checkInClosesAt: new Date(2026, 9, 25, 19).toISOString(),
  checkInRadiusMeters: 150,
  myParticipation: null
})

async function renderPlan (params = { planId: 'p1' }) {
  const service = createFakeAuthService({ user: COMPLETE_USER })
  return renderWithAuth(<SignedIn><PlanScreen navigation={navigation} route={{ params }} /></SignedIn>, { service })
}

describe('PlanScreen (detalle)', () => {
  beforeEach(() => {
    navigation.navigate.mockReset()
    navigation.goBack.mockReset()
    resetCatalogsCache()
    getCatalogs.mockReset().mockResolvedValue(CATALOG)
    getPlan.mockReset()
  })

  it('cargando', async () => {
    const pending = deferred()
    getPlan.mockReturnValue(pending.promise)

    await renderPlan()

    expect(await screen.findByText(TEXTS.loading)).toBeOnTheScreen()
    await act(async () => pending.resolve(PLAN))
  })

  it('con datos: título, cuándo (con hora de fin), dónde, costo, cupos, actividades, descripción y quién organiza', async () => {
    getPlan.mockResolvedValue(PLAN)

    await renderPlan()

    expect(await screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })).toBeOnTheScreen()
    expect(screen.getByText('dom 25/10 · 18:00 a 20:00')).toBeOnTheScreen()
    expect(screen.getByText('Parque Rodó')).toBeOnTheScreen()
    expect(screen.getByText('$ 150')).toBeOnTheScreen()
    expect(screen.getByText('Quedan 3 lugares')).toBeOnTheScreen()
    expect(screen.getByText('7 de 10')).toBeOnTheScreen()
    expect(await screen.findByText('Fútbol, Cine')).toBeOnTheScreen()
    expect(screen.getByText('Traer camiseta clara y oscura.')).toBeOnTheScreen()
    expect(screen.getByText('Lucía Pérez')).toBeOnTheScreen()
    expect(getPlan).toHaveBeenCalledWith('p1', expect.anything())
  })

  it('un plan con cupo ilimitado muestra "Sin límite" y solo la cantidad de inscriptos', async () => {
    getPlan.mockResolvedValue({ ...PLAN, capacity: null, availableSpots: null, participantCount: 42, price: 0, description: null })

    await renderPlan()

    expect(await screen.findByText('Sin límite de cupo')).toBeOnTheScreen()
    expect(screen.getByText('42')).toBeOnTheScreen()
    expect(screen.getByText('Gratis')).toBeOnTheScreen()
    expect(screen.queryByText(TEXTS.about)).not.toBeOnTheScreen()
  })

  it('un plan lleno se ve completo y avisa que no admite inscripciones', async () => {
    getPlan.mockResolvedValue({ ...PLAN, participantCount: 10, availableSpots: 0, isFull: true })

    await renderPlan()

    expect(await screen.findByText(TEXTS.full)).toBeOnTheScreen()
    expect(screen.getByText('Lleno')).toBeOnTheScreen()
    expect(screen.getByText('Traer camiseta clara y oscura.')).toBeOnTheScreen()
  })

  it('un plan cancelado (visible para su creador o inscriptos) lo indica', async () => {
    getPlan.mockResolvedValue({ ...PLAN, status: 'cancelled' })

    await renderPlan()

    expect(await screen.findByText(TEXTS.statusLabels.cancelled)).toBeOnTheScreen()
  })

  it('quien no creó el plan no ve el botón de editar', async () => {
    getPlan.mockResolvedValue(PLAN)

    await renderPlan()
    await screen.findByText('Lucía Pérez')

    expect(screen.queryByRole('button', { name: TEXTS.edit })).not.toBeOnTheScreen()
  })

  it('el creador puede ir a editar su plan', async () => {
    const own = { ...PLAN, isCreator: true, creator: { id: '1', name: 'Ana', photoUrl: null } }
    getPlan.mockResolvedValue(own)

    await renderPlan()
    await fireEvent.press(await screen.findByRole('button', { name: TEXTS.edit }))

    expect(screen.getByText(`Ana (${TEXTS.you})`)).toBeOnTheScreen()
    expect(navigation.navigate).toHaveBeenCalledWith('EditPlan', { plan: own })
  })

  it('404: explica que no está disponible y permite volver', async () => {
    getPlan.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND' }))

    await renderPlan()
    expect(await screen.findByText(TEXTS.notFoundTitle)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.back }))

    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('error: muestra el mensaje y permite reintentar', async () => {
    getPlan.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(PLAN)

    await renderPlan()
    expect(await screen.findByText(TEXTS.errorTitle)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

    expect(await screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })).toBeOnTheScreen()
  })

  it('si el catálogo no cargó, las actividades se muestran con su key (no rompe)', async () => {
    getCatalogs.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
    getPlan.mockResolvedValue(PLAN)

    await renderPlan()

    expect(await screen.findByText('futbol, cine')).toBeOnTheScreen()
  })
})
