// Aviso de lugar libre (S5-MOB-06) e invitar con un enlace (S5-MOB-05) desde el detalle de un plan.
import { Share } from 'react-native'
import { fireEvent, screen } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError } from '../services/api/errors.js'
import { cancelSpotAlert, listParticipants, requestSpotAlert } from '../services/api/participations.js'
import { getPlan } from '../services/api/plans.js'
import PlanScreen, { TEXTS } from './PlanScreen.jsx'

jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ getPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn(), requestSpotAlert: jest.fn(), cancelSpotAlert: jest.fn() }))

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const fromNow = (ms) => new Date(Date.now() + ms).toISOString()

const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => () => {}) }

/** Un plan que empieza en `startsIn` ms (por defecto, en dos días) y dura dos horas. */
function plan ({ startsIn = 48 * HOUR_MS, ...overrides } = {}) {
  return {
    id: 'p1',
    title: 'Fútbol 5 en Parque Rodó',
    description: null,
    startsAt: fromNow(startsIn),
    endsAt: fromNow(startsIn + 2 * HOUR_MS),
    location: { label: 'Parque Rodó', type: 'Point', coordinates: [-56.166, -34.913] },
    interests: ['futbol'],
    university: 'um',
    capacity: 10,
    participantCount: 7,
    availableSpots: 3,
    isFull: false,
    price: 0,
    status: 'open',
    photoUrl: null,
    creator: { id: 'u2', name: 'Lucía Pérez', photoUrl: null, reputation: 3 },
    isCreator: false,
    checkInOpensAt: fromNow(startsIn - 15 * MINUTE_MS),
    checkInClosesAt: fromNow(startsIn + 60 * MINUTE_MS),
    checkInRadiusMeters: 150,
    myParticipation: null,
    ...overrides
  }
}

const joined = (extra = {}) => ({ status: 'active', joinedAt: fromNow(-HOUR_MS), checkedInAt: null, noShow: false, ...extra })

async function renderPlan () {
  const service = createFakeAuthService({ user: COMPLETE_USER })
  const view = await renderWithAuth(<SignedIn><PlanScreen navigation={navigation} route={{ params: { planId: 'p1' } }} /></SignedIn>, { service })
  await screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })
  return view
}

const button = (name) => screen.getByRole('button', { name })
const queryButton = (name) => screen.queryByRole('button', { name })

const full = (overrides = {}) => plan({ participantCount: 10, availableSpots: 0, isFull: true, spotAlertRequested: false, ...overrides })

beforeEach(() => {
  jest.clearAllMocks()
  navigation.addListener.mockImplementation(() => () => {})
  resetCatalogsCache()
  getCatalogs.mockResolvedValue(CATALOG)
  getPlan.mockReset()
  requestSpotAlert.mockReset()
  cancelSpotAlert.mockReset()
  listParticipants.mockReset().mockResolvedValue({ items: [], nextCursor: null })
})

describe('PlanScreen: avisarme si se libera un lugar', () => {
  it('en un plan lleno lo ofrece; al pedirlo, el detalle dice que le vamos a avisar', async () => {
    getPlan.mockResolvedValueOnce(full()).mockResolvedValue(full({ spotAlertRequested: true }))
    requestSpotAlert.mockResolvedValue()
    await renderPlan()

    expect(queryButton(TEXTS.join)).not.toBeOnTheScreen()
    await fireEvent.press(button(TEXTS.askSpotAlert))

    expect(requestSpotAlert).toHaveBeenCalledWith('p1')
    expect(await screen.findByText(TEXTS.spotAlertOn)).toBeOnTheScreen()
    expect(queryButton(TEXTS.askSpotAlert)).not.toBeOnTheScreen()
  })

  it('con el aviso pedido se puede cancelar', async () => {
    getPlan.mockResolvedValueOnce(full({ spotAlertRequested: true })).mockResolvedValue(full())
    cancelSpotAlert.mockResolvedValue()
    await renderPlan()

    await fireEvent.press(button(TEXTS.cancelSpotAlert))

    expect(cancelSpotAlert).toHaveBeenCalledWith('p1')
    expect(await screen.findByRole('button', { name: TEXTS.askSpotAlert })).toBeOnTheScreen()
  })

  it.each([
    ['con lugar', () => plan()],
    ['con cupo ilimitado', () => plan({ capacity: null, availableSpots: null })],
    ['ya inscripto', () => full({ myParticipation: joined() })],
    ['con inscripciones cerradas', () => full({ status: 'closed' })]
  ])('no se ofrece %s', async (_case, shown) => {
    getPlan.mockResolvedValue(shown())
    await renderPlan()
    expect(queryButton(TEXTS.askSpotAlert)).not.toBeOnTheScreen()
  })

  it('si se liberó un lugar mientras tanto (PLAN_NOT_FULL) lo explica y refresca', async () => {
    getPlan.mockResolvedValueOnce(full()).mockResolvedValue(plan())
    requestSpotAlert.mockRejectedValue(new ApiError({ status: 409, code: 'PLAN_NOT_FULL' }))
    await renderPlan()

    await fireEvent.press(button(TEXTS.askSpotAlert))

    expect(await screen.findByText('Se liberó un lugar: ya podés inscribirte.')).toBeOnTheScreen()
    expect(await screen.findByRole('button', { name: TEXTS.join })).toBeOnTheScreen()
  })
})

describe('PlanScreen: invitar', () => {
  it('comparte un texto con el plan y el enlace junte://plans/<id>', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    getPlan.mockResolvedValue(plan())
    await renderPlan()

    await fireEvent.press(button(TEXTS.invite))

    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('junte://plans/p1') })
    expect(share.mock.calls[0][0].message).toContain('Fútbol 5 en Parque Rodó')
  })
})
