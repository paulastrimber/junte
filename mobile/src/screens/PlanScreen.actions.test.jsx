import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError } from '../services/api/errors.js'
import { joinPlan, leavePlan, listParticipants } from '../services/api/participations.js'
import { getPlan, updatePlan } from '../services/api/plans.js'
import PlanScreen, { TEXTS } from './PlanScreen.jsx'

jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ getPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))

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
const own = (overrides = {}) => plan({ isCreator: true, creator: { id: '1', name: 'Ana', photoUrl: null, reputation: 0 }, ...overrides })

async function renderPlan () {
  const service = createFakeAuthService({ user: COMPLETE_USER })
  const view = await renderWithAuth(<SignedIn><PlanScreen navigation={navigation} route={{ params: { planId: 'p1' } }} /></SignedIn>, { service })
  await screen.findByRole('header', { name: 'Fútbol 5 en Parque Rodó' })
  return view
}

const button = (name) => screen.getByRole('button', { name })
const queryButton = (name) => screen.queryByRole('button', { name })

describe('PlanScreen: inscripción, asistencia y estado', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    navigation.addListener.mockImplementation(() => () => {})
    resetCatalogsCache()
    getCatalogs.mockResolvedValue(CATALOG)
    getPlan.mockReset()
    joinPlan.mockReset()
    leavePlan.mockReset()
    updatePlan.mockReset()
    listParticipants.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  })

  describe('inscribirse', () => {
    it('la pantalla cambia recién cuando el servidor confirma', async () => {
      const pending = deferred()
      getPlan.mockResolvedValueOnce(plan()).mockResolvedValue(plan({ participantCount: 8, availableSpots: 2, myParticipation: joined() }))
      joinPlan.mockReturnValue(pending.promise)
      await renderPlan()

      await fireEvent.press(button(TEXTS.join))

      // Todavía sin respuesta: sigue como no inscripto.
      expect(screen.queryByText(TEXTS.joinedNotice)).not.toBeOnTheScreen()
      expect(screen.getByText('7 de 10')).toBeOnTheScreen()

      await act(async () => pending.resolve({ planId: 'p1', status: 'active' }))

      expect(await screen.findByText(TEXTS.joinedNotice)).toBeOnTheScreen()
      expect(screen.getByText('8 de 10')).toBeOnTheScreen()
      expect(button(TEXTS.leave)).toBeOnTheScreen()
      expect(queryButton(TEXTS.join)).not.toBeOnTheScreen()
      expect(joinPlan).toHaveBeenCalledWith('p1')
    })

    it.each([
      ['PLAN_FULL', 'El plan se llenó: ya no quedan lugares.'],
      ['PLAN_CLOSED', 'Este plan ya no admite inscripciones.'],
      ['ALREADY_JOINED', 'Ya estabas inscripto en este plan.']
    ])('%s: explica el motivo y vuelve a pedir el plan', async (code, message) => {
      getPlan.mockResolvedValueOnce(plan()).mockResolvedValue(plan({ isFull: true, availableSpots: 0, participantCount: 10 }))
      joinPlan.mockRejectedValue(new ApiError({ status: 409, code, message: 'mensaje del servidor' }))
      await renderPlan()

      await fireEvent.press(button(TEXTS.join))

      expect(await screen.findByText(message)).toBeOnTheScreen()
      await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2))
      expect(await screen.findByText(TEXTS.full)).toBeOnTheScreen()
    })

    it('no ofrece inscribirse en un plan lleno, cerrado o que ya empezó', async () => {
      getPlan.mockResolvedValue(plan({ isFull: true, availableSpots: 0 }))
      const view = await renderPlan()
      expect(queryButton(TEXTS.join)).not.toBeOnTheScreen()
      await view.unmount()

      getPlan.mockResolvedValue(plan({ status: 'closed' }))
      const closed = await renderPlan()
      expect(queryButton(TEXTS.join)).not.toBeOnTheScreen()
      await closed.unmount()

      getPlan.mockResolvedValue(plan({ startsIn: -10 * MINUTE_MS }))
      await renderPlan()
      expect(queryButton(TEXTS.join)).not.toBeOnTheScreen()
    })
  })

  describe('darse de baja', () => {
    it('pide confirmación y, al confirmar, el servidor vuelve a ofrecer inscribirse', async () => {
      getPlan.mockResolvedValueOnce(plan({ myParticipation: joined() })).mockResolvedValue(plan({ myParticipation: joined({ status: 'cancelled' }) }))
      leavePlan.mockResolvedValue()
      await renderPlan()

      await fireEvent.press(button(TEXTS.leave))
      // El lugar liberado lo puede ocupar otra persona: no se manda nada sin confirmar.
      expect(leavePlan).not.toHaveBeenCalled()
      expect(screen.getByText(TEXTS.confirmLeaveHint)).toBeOnTheScreen()

      await fireEvent.press(button(TEXTS.confirmLeave))

      expect(await screen.findByRole('button', { name: TEXTS.join })).toBeOnTheScreen()
      expect(screen.queryByText(TEXTS.joinedNotice)).not.toBeOnTheScreen()
      expect(leavePlan).toHaveBeenCalledWith('p1')
    })

    it('PLAN_CLOSED: explica por qué ya no se puede', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))
      leavePlan.mockRejectedValue(new ApiError({ status: 409, code: 'PLAN_CLOSED' }))
      await renderPlan()

      await fireEvent.press(button(TEXTS.leave))
      await fireEvent.press(button(TEXTS.confirmLeave))

      expect(await screen.findByText(/Ya no podés darte de baja/)).toBeOnTheScreen()
    })

    it('"Seguir inscripto" deja todo como estaba', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))
      await renderPlan()

      await fireEvent.press(button(TEXTS.leave))
      await fireEvent.press(button(TEXTS.keepJoined))

      expect(leavePlan).not.toHaveBeenCalled()
      expect(screen.queryByText(TEXTS.confirmLeaveHint)).not.toBeOnTheScreen()
      expect(button(TEXTS.leave)).toBeOnTheScreen()
    })

    it('no ofrece la baja con el plan empezado ni con la asistencia registrada', async () => {
      getPlan.mockResolvedValue(plan({ startsIn: -10 * MINUTE_MS, myParticipation: joined({ checkedInAt: fromNow(-5 * MINUTE_MS) }) }))

      await renderPlan()

      expect(queryButton(TEXTS.leave)).not.toBeOnTheScreen()
      expect(screen.getByText(TEXTS.checkedIn)).toBeOnTheScreen()
    })
  })

  describe('asistencia', () => {
    it('inscripto y dentro del horario: lleva a escanear el QR', async () => {
      getPlan.mockResolvedValue(plan({ startsIn: -10 * MINUTE_MS, myParticipation: joined() }))
      await renderPlan()

      await fireEvent.press(button(TEXTS.checkIn))

      expect(navigation.navigate).toHaveBeenCalledWith('CheckIn', { planId: 'p1' })
    })

    it('fuera del horario de asistencia no ofrece registrar', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))

      await renderPlan()

      expect(queryButton(TEXTS.checkIn)).not.toBeOnTheScreen()
    })

    it('quien no fue ve que quedó como ausente', async () => {
      getPlan.mockResolvedValue(plan({ startsIn: -3 * HOUR_MS, status: 'completed', myParticipation: joined({ noShow: true }) }))

      await renderPlan()

      expect(screen.getByText(TEXTS.noShow)).toBeOnTheScreen()
    })

    it('el creador muestra el QR; si está inscripto, desde ahí registra su asistencia', async () => {
      getPlan.mockResolvedValue(own({ startsIn: -10 * MINUTE_MS, myParticipation: joined() }))
      await renderPlan()

      await fireEvent.press(button(TEXTS.showQr))

      expect(navigation.navigate).toHaveBeenCalledWith('PlanQr', { planId: 'p1', canCheckIn: true })
      expect(queryButton(TEXTS.checkIn)).not.toBeOnTheScreen()
    })

    it('al montar pide el plan una sola vez; al volver a la pantalla (foco) lo pide otra vez', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))
      await renderPlan()
      await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(1))
      const [, onFocus] = navigation.addListener.mock.calls.find(([event]) => event === 'focus')

      // React Navigation emite `focus` también al montar: ese no vuelve a pedir nada.
      await act(async () => onFocus())
      expect(getPlan).toHaveBeenCalledTimes(1)
      expect(listParticipants).toHaveBeenCalledTimes(1)

      await act(async () => onFocus())

      await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(2))
    })
  })

  describe('quiénes van', () => {
    it('quien participa ve la lista con la reputación de cada uno y puede pedir más', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))
      listParticipants
        .mockResolvedValueOnce({ items: [{ id: 'u2', name: 'Lucía Pérez', photoUrl: null, reputation: 3 }, { id: 'u3', name: 'Mateo', photoUrl: null, reputation: 1 }], nextCursor: 'c1' })
        .mockResolvedValueOnce({ items: [{ id: 'u4', name: 'Sofía', photoUrl: null, reputation: 0 }], nextCursor: null })
      await renderPlan()

      expect(await screen.findByText('Mateo')).toBeOnTheScreen()
      expect(screen.getByText('1 asistencia')).toBeOnTheScreen()
      expect(screen.getByText('Lucía Pérez (organiza)')).toBeOnTheScreen()

      await fireEvent.press(button(TEXTS.participantsMore))

      expect(await screen.findByText('Sofía')).toBeOnTheScreen()
      expect(queryButton(TEXTS.participantsMore)).not.toBeOnTheScreen()
      expect(listParticipants).toHaveBeenLastCalledWith('p1', { limit: 20, cursor: 'c1' })
    })

    it('quien no participa no la ve ni la pide', async () => {
      getPlan.mockResolvedValue(plan())

      await renderPlan()

      expect(screen.queryByText(TEXTS.participants)).not.toBeOnTheScreen()
      expect(listParticipants).not.toHaveBeenCalled()
    })

    it('sin anotados lo dice; si falla, permite reintentar', async () => {
      getPlan.mockResolvedValue(own())
      listParticipants.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' })).mockResolvedValueOnce({ items: [], nextCursor: null })
      await renderPlan()

      expect(await screen.findByText(new RegExp(TEXTS.participantsError))).toBeOnTheScreen()
      await fireEvent.press(button(TEXTS.retry))

      expect(await screen.findByText(TEXTS.participantsEmpty)).toBeOnTheScreen()
    })
  })

  describe('el creador cambia el estado', () => {
    it('cierra y reabre las inscripciones', async () => {
      getPlan.mockResolvedValueOnce(own()).mockResolvedValueOnce(own({ status: 'closed' })).mockResolvedValue(own())
      updatePlan.mockResolvedValue({})
      await renderPlan()

      await fireEvent.press(button(TEXTS.closeSignUps))
      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.reopenSignUps }))

      expect(await screen.findByRole('button', { name: TEXTS.closeSignUps })).toBeOnTheScreen()
      expect(updatePlan.mock.calls).toEqual([['p1', { status: 'closed' }], ['p1', { status: 'open' }]])
    })

    it('cancelar pide confirmación antes de llamar al servidor', async () => {
      getPlan.mockResolvedValueOnce(own()).mockResolvedValue(own({ status: 'cancelled' }))
      updatePlan.mockResolvedValue({})
      await renderPlan()

      await fireEvent.press(button(TEXTS.cancelPlan))
      expect(updatePlan).not.toHaveBeenCalled()
      expect(screen.getByText(TEXTS.confirmCancelHint)).toBeOnTheScreen()

      await fireEvent.press(button(TEXTS.confirmCancel))

      expect(await screen.findByText(TEXTS.statusLabels.cancelled)).toBeOnTheScreen()
      expect(updatePlan).toHaveBeenCalledWith('p1', { status: 'cancelled' })
      expect(queryButton(TEXTS.cancelPlan)).not.toBeOnTheScreen()
    })

    it('"No cancelar" deja todo como estaba', async () => {
      getPlan.mockResolvedValue(own())
      await renderPlan()

      await fireEvent.press(button(TEXTS.cancelPlan))
      await fireEvent.press(button(TEXTS.keepPlan))

      expect(updatePlan).not.toHaveBeenCalled()
      expect(button(TEXTS.cancelPlan)).toBeOnTheScreen()
    })

    it('quien no creó el plan no ve ninguna de esas acciones', async () => {
      getPlan.mockResolvedValue(plan({ myParticipation: joined() }))

      await renderPlan()

      for (const title of [TEXTS.closeSignUps, TEXTS.cancelPlan, TEXTS.showQr, TEXTS.edit]) expect(queryButton(title)).not.toBeOnTheScreen()
    })
  })
})
