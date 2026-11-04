import { act, fireEvent, screen } from '@testing-library/react-native'

import { COMPLETE_USER, SignedIn, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { POLL_INTERVAL_MS } from '../hooks/useChat.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMessages, sendMessage } from '../services/api/messages.js'
import { socketService } from '../services/socket.js'
import ChatScreen, { TEXTS } from './ChatScreen.jsx'

jest.mock('../services/api/messages.js', () => ({ listMessages: jest.fn(), sendMessage: jest.fn() }))
jest.mock('../services/voiceNotes.js', () => ({ uploadVoiceNote: jest.fn(), VOICE_MAX_DURATION_MS: 60000 }))
jest.mock('../services/socket.js', () => ({
  SOCKET_STATUS: { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', RECONNECTING: 'reconnecting', UNAVAILABLE: 'unavailable' },
  socketService: { subscribe: jest.fn(), sendChatMessage: jest.fn(), getStatus: jest.fn(), onStatusChange: jest.fn() }
}))

const ME = { id: COMPLETE_USER.id, name: COMPLETE_USER.name, photoUrl: null, reputation: 0 }
const BETO = { id: 'u2', name: 'Beto', photoUrl: null, reputation: 1 }
// Mensajes de HOY a las 10:n: así la hora se muestra sola ('10:01'), sin la fecha, cualquier día que corra el
// test. El formato de "otro día" ya lo cubre utils/chat.test.js con un `now` fijo.
const TODAY = new Date()
const message = (n, extra = {}) => ({
  id: `m${n}`,
  planId: 'p1',
  sender: BETO,
  type: 'text',
  text: `Mensaje ${n}`,
  clientId: null,
  createdAt: new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 10, n).toISOString(),
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
    // La foto de cada burbuja es decorativa (el nombre ya está escrito): el lector no repite "Sin foto de perfil".
    expect(screen.queryAllByLabelText(/foto de perfil/i)).toHaveLength(0)
  })

  it('agrupa los seguidos de la misma persona: un nombre arriba y una foto abajo por grupo', async () => {
    // Del más nuevo al más viejo: Beto 10:01 y 10:02 (grupo), yo 10:03, Beto 10:09 (más de 5 min: otro grupo).
    listMessages.mockResolvedValue({ items: [message(9), message(3, { sender: ME, text: 'Yo llego' }), message(2), message(1)], nextCursor: null })

    await renderChat()

    expect(await screen.findByText('Mensaje 9')).toBeOnTheScreen()
    expect(screen.getAllByText('Beto')).toHaveLength(2)
    // La inicial del avatar (sin foto) solo en el último de cada grupo ajeno.
    expect(screen.getAllByText('B', { includeHiddenElements: true })).toHaveLength(2)
  })

  it('cada burbuja se anuncia completa, con quién y la hora, aunque no se vea el nombre', async () => {
    listMessages.mockResolvedValue({ items: [message(3, { sender: ME, text: 'Yo llego' }), message(2), message(1)], nextCursor: null })

    await renderChat()

    expect(await screen.findByLabelText('Beto: Mensaje 1. 10:01')).toBeOnTheScreen()
    expect(screen.getByLabelText('Beto: Mensaje 2. 10:02')).toBeOnTheScreen()
    expect(screen.getByLabelText('Vos: Yo llego. 10:03')).toBeOnTheScreen()
  })

  it('grupo de 3 ajenos: el nombre y la foto una sola vez, y cada uno se anuncia "Ana: texto. hora"', async () => {
    const ANA = { id: 'u3', name: 'Ana', photoUrl: null, reputation: 2 }
    listMessages.mockResolvedValue({ items: [message(4, { sender: ME, text: 'Dale' }), message(3, { sender: ANA }), message(2, { sender: ANA }), message(1, { sender: ANA })], nextCursor: null })

    await renderChat()

    expect(await screen.findByLabelText('Ana: Mensaje 1. 10:01')).toBeOnTheScreen()
    expect(screen.getByLabelText('Ana: Mensaje 2. 10:02')).toBeOnTheScreen()
    expect(screen.getByLabelText('Ana: Mensaje 3. 10:03')).toBeOnTheScreen()
    expect(screen.getByLabelText('Vos: Dale. 10:04')).toBeOnTheScreen()
    expect(screen.getAllByText('Ana')).toHaveLength(1)
    // La inicial del avatar (decorativo, oculto al lector) una sola vez: en el último del grupo.
    expect(screen.getAllByText('A', { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.queryAllByText('A')).toHaveLength(0)
  })

  it('textos de la pantalla en voseo, sin punto final en el título de error', async () => {
    expect(TEXTS.errorTitle).toBe('No pudimos cargar el chat')
    expect(TEXTS.unsupported).toBe('Actualizá la app para ver este mensaje')

    listMessages.mockResolvedValue({ items: [message(1, { type: 'sticker', text: '' })], nextCursor: null })
    await renderChat()

    expect(await screen.findByText('Actualizá la app para ver este mensaje')).toBeOnTheScreen()
    expect(screen.getByLabelText('Beto: Actualizá la app para ver este mensaje. 10:01')).toBeOnTheScreen()
  })

  it('el error de carga se titula "No pudimos cargar el chat"', async () => {
    listMessages.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'))

    await renderChat()

    expect(await screen.findByText('No pudimos cargar el chat')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeOnTheScreen()
  })

  it('un mensaje de un tipo que la app no conoce no rompe la lista', async () => {
    listMessages.mockResolvedValue({ items: [message(2, { type: 'sticker', text: '' }), message(1)], nextCursor: null })

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

    expect(await screen.findByText('Solo quienes se inscribieron y quien creó el plan pueden usar el chat.')).toBeOnTheScreen()
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
  it('con el campo vacío o solo con espacios ofrece grabar una nota de voz en lugar de enviar', async () => {
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)
    expect(screen.getByRole('button', { name: TEXTS.record })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: TEXTS.send })).toBeNull()

    await fireEvent.changeText(input(), '   ')
    expect(screen.queryByRole('button', { name: TEXTS.send })).toBeNull()

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
    expect(screen.getByText('Solo quienes se inscribieron y quien creó el plan pueden usar el chat.')).toBeOnTheScreen()
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

describe('ChatScreen: notas de voz', () => {
  const audio = require('expo-audio')
  const { uploadVoiceNote } = require('../services/voiceNotes.js')

  it('muestra las notas de voz con su duración y un botón para reproducirlas', async () => {
    listMessages.mockResolvedValue({ items: [message(1, { type: 'voice', text: null, audioUrl: 'https://s3/a.m4a', durationMs: 7000 })], nextCursor: null })

    await renderChat()

    expect(await screen.findByText('0:07')).toBeOnTheScreen()
    expect(screen.getByLabelText('Beto: Nota de voz 0:07. 10:01')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Reproducir nota de voz' }))
    expect(audio.__players.at(-1).play).toHaveBeenCalled()
  })

  it('sin permiso del micrófono lo explica y no graba', async () => {
    audio.requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false })
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.record }))

    expect(await screen.findByText(TEXTS.micDenied)).toBeOnTheScreen()
    expect(audio.__recorders.at(-1).record).not.toHaveBeenCalled()
  })

  it('graba, sube el audio y lo manda como nota de voz por el socket', async () => {
    audio.requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: true })
    uploadVoiceNote.mockResolvedValue({ audioKey: 'messages/p1/u1/a.m4a', durationMs: 3000 })
    socketService.sendChatMessage.mockImplementation(async ({ clientId }) => message(9, { sender: ME, type: 'voice', text: null, audioUrl: 'https://s3/a.m4a', durationMs: 3000, clientId }))
    await renderChat()
    await screen.findByText(TEXTS.emptyTitle)

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.record }))
    expect(await screen.findByRole('button', { name: TEXTS.sendVoice })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.sendVoice }))

    expect(uploadVoiceNote).toHaveBeenCalledWith(expect.objectContaining({ planId: 'p1', uri: 'file:///tmp/nota.m4a' }))
    expect(socketService.sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ planId: 'p1', type: 'voice', audioKey: 'messages/p1/u1/a.m4a' }))
  })
})
