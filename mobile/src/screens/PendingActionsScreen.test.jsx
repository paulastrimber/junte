import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { sendMessage } from '../services/api/messages.js'
import { joinPlan } from '../services/api/participations.js'
import { connectivity, outbox } from '../services/offline/index.js'
import PendingActionsScreen, { TEXTS } from './PendingActionsScreen.jsx'

jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))
jest.mock('../services/api/messages.js', () => ({ listMessages: jest.fn(), sendMessage: jest.fn() }))

beforeEach(async () => {
  joinPlan.mockReset()
  sendMessage.mockReset()
  await outbox.clear()
  jest.spyOn(connectivity, 'isOnline').mockReturnValue(false)
})

afterEach(() => jest.restoreAllMocks())

describe('PendingActionsScreen', () => {
  it('sin nada en la cola lo dice', async () => {
    await render(<PendingActionsScreen />)

    expect(await screen.findByText(TEXTS.emptyTitle)).toBeOnTheScreen()
  })

  it('muestra lo pendiente, y lo que el servidor rechazó con el motivo; se puede descartar', async () => {
    await outbox.enqueue('join', { planId: 'p2', planTitle: 'Cine' })
    await outbox.enqueue('message', { planId: 'p1', planTitle: 'Fútbol', text: 'Llego tarde', clientId: 'c1' })

    await render(<PendingActionsScreen />)
    expect(await screen.findByText('Inscribirte en «Cine»')).toBeOnTheScreen()
    expect(screen.getByText('Mensaje en el chat de «Fútbol»')).toBeOnTheScreen()
    expect(screen.getByText('Llego tarde')).toBeOnTheScreen()
    expect(screen.getByText(TEXTS.offline)).toBeOnTheScreen()

    // Vuelve la red: la inscripción la rechaza el servidor (se llenó) y el mensaje sigue sin poder salir.
    connectivity.isOnline.mockReturnValue(true)
    joinPlan.mockRejectedValue(new ApiError({ status: 409, code: 'PLAN_FULL' }))
    sendMessage.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
    await act(async () => outbox.flush())

    expect(await screen.findByText('El plan se llenó: ya no quedan lugares.')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.retry })).toBeOnTheScreen()
    await fireEvent.press(screen.getAllByRole('button', { name: TEXTS.discard })[0])

    expect(screen.queryByText('Inscribirte en «Cine»')).not.toBeOnTheScreen()
    expect(screen.getByText('Mensaje en el chat de «Fútbol»')).toBeOnTheScreen()
  })
})
