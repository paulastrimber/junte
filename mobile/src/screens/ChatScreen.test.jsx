import { act, fireEvent, screen } from '@testing-library/react-native'

import { COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { POLL_INTERVAL_MS } from '../hooks/useChat.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMessages, sendMessage } from '../services/api/messages.js'
import { socketService } from '../services/socket.js'
import ChatScreen, { TEXTS } from './ChatScreen.jsx'

jest.mock('../services/api/messages.js', () => ({ listMessages: jest.fn(), sendMessage: jest.fn() }))
jest.mock('../services/socket.js', () => ({
  SOCKET_STATUS: { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', RECONNECTING: 'reconnecting', UNAVAILABLE: 'unavailable' },
  socketService: { subscribe: jest.fn(), sendChatMessage: jest.fn(), getStatus: jest.fn(), onStatusChange: jest.fn() }
}))

const ME = { id: COMPLETE_USER.id, name: COMPLETE_USER.name, photoUrl: null, reputation: 0 }
const BETO = { id: 'u2', name: 'Beto', photoUrl: null, reputation: 1 }
const message = (n, extra = {}) => ({
  id: `m${n}`,
  planId: 'p1',
  sender: BETO,
  type: 'text',
  text: `Mensaje ${n}`,
  clientId: null,
  createdAt: new Date(2026, 9, 14, 10, n).toISOString(),
  ...extra
})
const apiError = (status, code) => new ApiError({ status, code, requestId: 'r1' })

let focusHandlers
const navigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn((event, handler) => { focusHandlers[event] = handler; return () => {} }) }

let socket
function fakeSocket () {
  const state = { status: 'connecting', listener: null }
  socketService.getStatus.mockImplementation(() => state.status)
  socketService.onStatusChange.mockImplementation((listener) => { state.listener = listener; return () => {} })
  socketService.subscribe.mockReturnValue(() => {})
  state.setStatus = async (status) => act(async () => { state.status = status; state.listener(status) })
  return state
}

async function renderChat () {
  const service = createFakeAuthService({ user: COMPLETE_USER })
  return renderWithAuth(<SignedIn><ChatScreen navigation={navigation} route={{ params: { planId: 'p1', title: 'Fútbol 5' } }} /></SignedIn>, { service })
}

const input = () => screen.getByLabelText(TEXTS.inputLabel)
const sendButton = () => screen.getByRole('button', { name: TEXTS.send })

beforeEach(() => {
  focusHandlers = {}
  navigation.addListener.mockClear()
  listMessages.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  sendMessage.mockReset()
  socketService.sendChatMessage.mockReset()
  socket = fakeSocket()
})

describe('ChatScreen: estados', () => {
  it('cargando', async () => {
    const pending = deferred()
    listMessages.mockReturnValue(pending.promise)

    await renderChat()

    expect(await screen.findByText(TEXTS.loading)).toBeOnTheScreen()
    expect(screen.queryByLabelText(TEXTS.inputLabel)).not.toBeOnTheScreen()
    await act(async () => pending.resolve({ items: [], nextCursor: null }))
  })

  it('vacío: invita a escribir el primero y deja el campo para hacerlo', async () => {
    await renderChat()

    expect(await screen.findByText(TEXTS.emptyTitle)).toBeOnTheScreen()
    expect(input()).toBeOnTheScreen()
  })

  it('con datos: mensajes ajenos con nombre y hora, propios sin nombre', async () => {
    listMessages.mockResolvedValue({ items: [message(2, { sender: ME, text: 'Yo llego' }), message(1)], nextCursor: null })

    await renderChat()

    expect(await screen.findByText('Yo llego')).toBeOnTheScreen()
    expect(screen.getByText('Mensaje 1')).toBeOnTheScreen()
    // Del otro se ve el nombre; de uno mismo no.
    expect(screen.getAllByText('Beto')).toHaveLength(1)
    expect(screen.queryByText(ME.name)).not.toBeOnTheScreen()
    expect(screen.getByText('10:01')).toBeOnTheScreen()
    expect(screen.getByText('10:02')).toBeOnTheScreen()
  })

  it('un mensaje de un tipo que la app no conoce no rompe la lista', async () => {
    listMessages.mockResolvedValue({ items: [message(2, { type: 'voice', text: '' }), message(1)], nextCursor: null })

    await renderChat()

    expect(await screen.findByText(TEXTS.unsupported)).toBeOnTheScreen()
    expect(screen.getByText('Mensaje 1')).toBeOnTheScreen()
  })

  it('error: muestra el motivo y permite reintentar (sin conexión lo dice así)', async () => {
    listMessages.mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)).mockResolvedValueOnce({ items: [message(1)], nextCursor: null })

    await renderChat()
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen()
    expect(screen.getByText('No pudimos conectarnos con el servidor. Revisá tu conexión.')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

    expect(await screen.findByText('Mensaje 1')).toBeOnTheScreen()
  })

  it('sin permiso (no está anotado) explica quién puede usar el chat y no muestra el campo', async () => {
    listMessages.mockRejectedValue(apiError(403, 'FORBIDDEN'))

    await renderChat()

    expect(await screen.findByText('Solo quienes están anotados y quien creó el plan pueden usar el chat.')).toBeOnTheScreen()
    expect(screen.queryByLabelText(TEXTS.inputLabel)).not.toBeOnTheScreen()
  })

  it('avisa discretamente cuando no hay tiempo real y se actualiza por polling', async () => {
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    expect(screen.queryByText(TEXTS.polling)).not.toBeOnTheScreen()

    await socket.setStatus('unavailable')

    expect(screen.getByText('Sin conexión en tiempo real: actualizamos cada 5 s')).toBeOnTheScreen()
  })

  it('el polling se frena cuando la pantalla pierde el foco', async () => {
    jest.useFakeTimers()
    try {
      await renderChat()
      await act(async () => jest.advanceTimersByTimeAsync(0))
      await socket.setStatus('unavailable')
      listMessages.mockClear()

      await act(async () => focusHandlers.blur())
      await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2))
      expect(listMessages).not.toHaveBeenCalled()

      await act(async () => focusHandlers.focus())
      await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
      expect(listMessages).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('ChatScreen: historial', () => {
  it('al llegar al final de la lista (los más viejos) carga la página anterior', async () => {
    listMessages
      .mockResolvedValueOnce({ items: [message(3)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [message(2)], nextCursor: null })

    await renderChat()
    await screen.findByText('Mensaje 3')
    await fireEvent(screen.getByTestId('chat-list'), 'endReached')

    expect(await screen.findByText('Mensaje 2')).toBeOnTheScreen()
    expect(listMessages).toHaveBeenLastCalledWith('p1', { limit: 30, cursor: 'c1' })
  })

  it('si falla cargar los anteriores lo dice y permite reintentar', async () => {
    listMessages
      .mockResolvedValueOnce({ items: [message(3)], nextCursor: 'c1' })
      .mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.TIMEOUT))
      .mockResolvedValueOnce({ items: [message(2)], nextCursor: null })

    await renderChat()
    await screen.findByText('Mensaje 3')
    await fireEvent(screen.getByTestId('chat-list'), 'endReached')
    expect(await screen.findByText(/No pudimos cargar los mensajes anteriores/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.retry }))

    expect(await screen.findByText('Mensaje 2')).toBeOnTheScreen()
  })
})

describe('ChatScreen: enviar', () => {
  it('el botón está deshabilitado con el campo vacío o solo con espacios', async () => {
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    expect(sendButton()).toBeDisabled()

    await fireEvent.changeText(input(), '   ')
    expect(sendButton()).toBeDisabled()

    await fireEvent.changeText(input(), 'Hola')
    expect(sendButton()).toBeEnabled()
  })

  it('envía, vacía el campo, muestra "Enviando…" y al confirmar queda con su hora', async () => {
    const ack = deferred()
    socketService.sendChatMessage.mockReturnValue(ack.promise)
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)

    await fireEvent.changeText(input(), '  Hola a todos  ')
    await fireEvent.press(sendButton())

    expect(input().props.value).toBe('')
    expect(screen.getByText('Hola a todos')).toBeOnTheScreen()
    expect(screen.getByText(TEXTS.sending)).toBeOnTheScreen()
    const { clientId } = socketService.sendChatMessage.mock.calls[0][0]
    await act(async () => ack.resolve(message(5, { sender: ME, text: 'Hola a todos', clientId })))

    expect(screen.queryByText(TEXTS.sending)).not.toBeOnTheScreen()
    expect(screen.getByText('10:05')).toBeOnTheScreen()
    expect(screen.getAllByText('Hola a todos')).toHaveLength(1)
  })

  it('si falla muestra "No se envió · Reintentar" y reintentar lo manda de nuevo', async () => {
    socketService.sendChatMessage.mockRejectedValueOnce(apiError(0, 'VALIDATION_ERROR'))
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    await fireEvent.changeText(input(), 'Hola')
    await fireEvent.press(sendButton())

    expect(await screen.findByText(`${TEXTS.notSent} · ${TEXTS.retrySend}`)).toBeOnTheScreen()
    expect(screen.getByText('El mensaje no es válido: tiene que tener entre 1 y 2000 caracteres.')).toBeOnTheScreen()
    const { clientId } = socketService.sendChatMessage.mock.calls[0][0]
    socketService.sendChatMessage.mockResolvedValueOnce(message(6, { sender: ME, text: 'Hola', clientId }))
    await fireEvent.press(screen.getByRole('button', { name: `${TEXTS.notSent}. ${TEXTS.retrySend}` }))

    expect(socketService.sendChatMessage).toHaveBeenLastCalledWith({ planId: 'p1', text: 'Hola', clientId })
    expect(screen.queryByText(`${TEXTS.notSent} · ${TEXTS.retrySend}`)).not.toBeOnTheScreen()
    expect(screen.getAllByText('Hola')).toHaveLength(1)
  })

  it('si al enviar ya no tiene acceso (se dio de baja) muestra el error del chat en lugar de "Reintentar"', async () => {
    socketService.sendChatMessage.mockRejectedValueOnce(apiError(0, 'FORBIDDEN'))
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    await fireEvent.changeText(input(), 'Hola')
    await fireEvent.press(sendButton())

    expect(await screen.findByText(TEXTS.errorTitle)).toBeOnTheScreen()
    expect(screen.getByText('Solo quienes están anotados y quien creó el plan pueden usar el chat.')).toBeOnTheScreen()
    expect(screen.queryByText(`${TEXTS.notSent} · ${TEXTS.retrySend}`)).not.toBeOnTheScreen()
  })

  it('limita el largo a 2000 y muestra el contador solo cerca del límite', async () => {
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    expect(input().props.maxLength).toBe(2000)
    expect(screen.queryByText(/\/2000/)).not.toBeOnTheScreen()

    await fireEvent.changeText(input(), 'a'.repeat(1850))

    expect(screen.getByText('1850/2000')).toBeOnTheScreen()
  })
})
