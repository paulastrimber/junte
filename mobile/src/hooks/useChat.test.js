import { act, renderHook, waitFor } from '@testing-library/react-native'

import { AppState } from 'react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { listMessages, sendMessage } from '../services/api/messages.js'
import { connectivity, outbox, readCache } from '../services/offline/index.js'
import { socketService } from '../services/socket.js'
import { CHAT_STATUS, POLL_INTERVAL_MS, useChat } from './useChat.js'

jest.mock('../services/api/messages.js', () => ({ listMessages: jest.fn(), sendMessage: jest.fn() }))
jest.mock('../services/socket.js', () => ({
  SOCKET_STATUS: { IDLE: 'idle', CONNECTING: 'connecting', CONNECTED: 'connected', RECONNECTING: 'reconnecting', UNAVAILABLE: 'unavailable' },
  socketService: { subscribe: jest.fn(), sendChatMessage: jest.fn(), getStatus: jest.fn(), onStatusChange: jest.fn() }
}))

const USER = { id: 'u1', name: 'Ana', photoUrl: null, reputation: 2 }
const OTHER = { id: 'u2', name: 'Beto', photoUrl: null, reputation: 0 }
const message = (n, extra = {}) => ({
  id: `m${n}`,
  planId: 'p1',
  sender: OTHER,
  type: 'text',
  text: `Mensaje ${n}`,
  clientId: null,
  createdAt: `2026-10-14T10:${String(n).padStart(2, '0')}:00.000Z`,
  ...extra
})
const page = (numbers, nextCursor = null) => ({ items: numbers.map((n) => message(n)), nextCursor })
const texts = (result) => result.current.messages.map((item) => item.text)
const apiError = (status, code) => new ApiError({ status, code, requestId: 'r1' })
const networkError = () => apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)

// Socket falso: el test dispara los mensajes y los cambios de estado.
let socket
function fakeSocket () {
  const state = { status: 'connecting', onMessage: null, onJoinError: null, listener: null, unsubscribe: jest.fn(), stopStatus: jest.fn() }
  socketService.getStatus.mockImplementation(() => state.status)
  socketService.onStatusChange.mockImplementation((listener) => { state.listener = listener; return state.stopStatus })
  socketService.subscribe.mockImplementation((planId, onMessage, onJoinError, onHidden) => {
    state.onMessage = onMessage
    state.onJoinError = onJoinError
    state.onHidden = onHidden
    return state.unsubscribe
  })
  state.setStatus = async (status) => act(async () => { state.status = status; state.listener(status) })
  state.receive = async (incoming) => act(async () => state.onMessage(incoming))
  state.hide = async (messageId) => act(async () => state.onHidden(messageId))
  return state
}

const setup = async (options = {}) => {
  const view = await renderHook(() => useChat('p1', { user: USER, ...options }))
  await waitFor(() => expect(view.result.current.status).not.toBe(CHAT_STATUS.LOADING))
  return view
}

beforeEach(async () => {
  listMessages.mockReset().mockResolvedValue(page([2, 1]))
  sendMessage.mockReset()
  socketService.sendChatMessage.mockReset()
  socket = fakeSocket()
  // La cola de pendientes es compartida por toda la app: cada test arranca sin nada encolado y con conexión.
  await outbox.clear()
  jest.spyOn(connectivity, 'isOnline').mockReturnValue(true)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('useChat: carga e historial', () => {
  it('arranca cargando y muestra la primera página del más nuevo al más viejo', async () => {
    const pending = deferred()
    listMessages.mockReturnValueOnce(pending.promise)

    const { result } = await renderHook(() => useChat('p1', { user: USER }))
    expect(result.current).toMatchObject({ status: CHAT_STATUS.LOADING, messages: [] })
    await act(async () => pending.resolve(page([1, 2, 3], 'c1')))

    expect(result.current.status).toBe(CHAT_STATUS.READY)
    expect(texts(result)).toEqual(['Mensaje 3', 'Mensaje 2', 'Mensaje 1'])
    expect(result.current.hasMore).toBe(true)
    expect(listMessages).toHaveBeenCalledWith('p1', { limit: 30 })
  })

  it('un chat sin mensajes queda listo y vacío', async () => {
    listMessages.mockResolvedValue({ items: [], nextCursor: null })

    const { result } = await setup()

    expect(result.current).toMatchObject({ status: CHAT_STATUS.READY, messages: [], hasMore: false })
  })

  it('un error en la primera carga pasa a error y reload lo reintenta', async () => {
    listMessages.mockRejectedValueOnce(apiError(403, 'FORBIDDEN')).mockResolvedValueOnce(page([1]))

    const { result } = await setup()
    expect(result.current.status).toBe(CHAT_STATUS.ERROR)
    expect(result.current.error).toMatchObject({ code: 'FORBIDDEN' })

    await act(async () => result.current.reload())

    await waitFor(() => expect(result.current.status).toBe(CHAT_STATUS.READY))
    expect(texts(result)).toEqual(['Mensaje 1'])
  })

  it('loadOlder pide la página siguiente con el cursor y la agrega al final', async () => {
    listMessages.mockResolvedValueOnce(page([4, 3], 'c1')).mockResolvedValueOnce(page([2, 1]))
    const { result } = await setup()

    await act(async () => result.current.loadOlder())

    expect(listMessages).toHaveBeenLastCalledWith('p1', { limit: 30, cursor: 'c1' })
    expect(texts(result)).toEqual(['Mensaje 4', 'Mensaje 3', 'Mensaje 2', 'Mensaje 1'])
    expect(result.current).toMatchObject({ hasMore: false, isLoadingOlder: false })
  })

  it('loadOlder no hace nada sin más páginas ni mientras ya está cargando', async () => {
    const olderPage = deferred()
    listMessages.mockResolvedValueOnce(page([3], 'c1')).mockReturnValueOnce(olderPage.promise)
    const { result } = await setup()

    await act(async () => { result.current.loadOlder(); result.current.loadOlder() })
    expect(listMessages).toHaveBeenCalledTimes(2)
    expect(result.current.isLoadingOlder).toBe(true)
    await act(async () => olderPage.resolve(page([1])))
    await act(async () => result.current.loadOlder())

    expect(listMessages).toHaveBeenCalledTimes(2)
  })

  it('si falla cargar mensajes anteriores conserva la lista y deja reintentar', async () => {
    listMessages.mockResolvedValueOnce(page([3], 'c1')).mockRejectedValueOnce(networkError()).mockResolvedValueOnce(page([2]))
    const { result } = await setup()

    await act(async () => result.current.loadOlder())
    expect(result.current.loadOlderError).toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    expect(texts(result)).toEqual(['Mensaje 3'])
    await act(async () => result.current.loadOlder())

    expect(result.current.loadOlderError).toBeNull()
    expect(texts(result)).toEqual(['Mensaje 3', 'Mensaje 2'])
  })
})

describe('useChat: tiempo real', () => {
  it('se suscribe a la sala del plan y suelta la suscripción al desmontar', async () => {
    const { unmount } = await setup()

    expect(socketService.subscribe).toHaveBeenCalledWith('p1', expect.any(Function), expect.any(Function), expect.any(Function))
    await unmount()

    expect(socket.unsubscribe).toHaveBeenCalled()
    expect(socket.stopStatus).toHaveBeenCalled()
  })

  it('un mensaje nuevo del socket aparece arriba, y repetido no se duplica', async () => {
    const { result } = await setup()

    await socket.receive(message(3))
    await socket.receive(message(3))

    expect(texts(result)).toEqual(['Mensaje 3', 'Mensaje 2', 'Mensaje 1'])
  })

  it('si el servidor no deja entrar a la sala (perdió el acceso) pasa a error', async () => {
    const { result } = await setup()

    await act(async () => socket.onJoinError(apiError(0, 'FORBIDDEN')))

    expect(result.current).toMatchObject({ status: CHAT_STATUS.ERROR, error: { code: 'FORBIDDEN' } })
  })

  it('al conectarse (o reconectarse) vuelve a pedir la primera página y la fusiona', async () => {
    const { result } = await setup()
    await socket.setStatus('connected')
    await socket.setStatus('reconnecting')
    listMessages.mockResolvedValueOnce(page([4, 3, 2], 'c9'))

    await socket.setStatus('connected')

    await waitFor(() => expect(texts(result)).toEqual(['Mensaje 4', 'Mensaje 3', 'Mensaje 2', 'Mensaje 1']))
    expect(listMessages).toHaveBeenCalledTimes(3)
  })

  it('si en la recuperación hay un hueco descarta lo anterior y toma el cursor de la página nueva', async () => {
    listMessages.mockResolvedValueOnce(page([2, 1], null))
    const { result } = await setup()
    listMessages.mockResolvedValueOnce(page([9, 8], 'c8'))

    await socket.setStatus('connected')

    await waitFor(() => expect(texts(result)).toEqual(['Mensaje 9', 'Mensaje 8']))
    expect(result.current.hasMore).toBe(true)
  })

  it('si la recuperación falla (sin red) conserva lo que se ve', async () => {
    const { result } = await setup()
    listMessages.mockRejectedValueOnce(networkError())

    await socket.setStatus('connected')

    expect(result.current.status).toBe(CHAT_STATUS.READY)
    expect(texts(result)).toEqual(['Mensaje 2', 'Mensaje 1'])
  })
})

describe('useChat: polling cuando el WebSocket no se sostiene', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('con el socket no disponible pide la primera página cada 5 s y se detiene al reconectar', async () => {
    const { result } = await setup()
    expect(result.current.isPolling).toBe(false)
    listMessages.mockClear()

    await socket.setStatus('unavailable')
    expect(result.current.isPolling).toBe(true)
    listMessages.mockResolvedValue(page([3, 2, 1]))
    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
    expect(listMessages).toHaveBeenCalledTimes(1)
    expect(texts(result)).toEqual(['Mensaje 3', 'Mensaje 2', 'Mensaje 1'])
    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
    expect(listMessages).toHaveBeenCalledTimes(2)

    await socket.setStatus('connected')
    // Una más por la recuperación al conectar; después, silencio.
    const afterReconnect = listMessages.mock.calls.length
    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3))

    expect(result.current.isPolling).toBe(false)
    expect(listMessages).toHaveBeenCalledTimes(afterReconnect)
  })

  it('un tick del polling sin novedades (solo cambia la firma de las fotos) no cambia la lista ni sus mensajes', async () => {
    const signed = (signature) => ({ ...OTHER, photoUrl: `https://bucket.s3.amazonaws.com/users/u2/a.jpg?X-Amz-Signature=${signature}` })
    listMessages.mockResolvedValue({ items: [message(2, { sender: signed('uno') }), message(1, { sender: signed('uno') })], nextCursor: null })
    const { result } = await setup()
    await socket.setStatus('unavailable')
    const before = result.current.messages

    listMessages.mockResolvedValue({ items: [message(2, { sender: signed('dos') }), message(1, { sender: signed('dos') })], nextCursor: null })
    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS))

    expect(listMessages).toHaveBeenCalledTimes(2)
    expect(result.current.messages).toBe(before)
    expect(result.current.messages[0].sender.photoUrl).toContain('Signature=uno')
  })

  it('con la pantalla fuera de foco no hace polling', async () => {
    const { result } = await setup({ isActive: false })
    listMessages.mockClear()

    await socket.setStatus('unavailable')
    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2))

    expect(result.current.isPolling).toBe(true)
    expect(listMessages).not.toHaveBeenCalled()
  })

  it('al desmontar detiene el polling', async () => {
    const { unmount } = await setup()
    await socket.setStatus('unavailable')
    await unmount()
    listMessages.mockClear()

    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2))

    expect(listMessages).not.toHaveBeenCalled()
  })

  it('si el polling descubre que perdió el acceso pasa a error', async () => {
    const { result } = await setup()
    await socket.setStatus('unavailable')
    listMessages.mockRejectedValue(apiError(403, 'FORBIDDEN'))

    await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS))

    expect(result.current).toMatchObject({ status: CHAT_STATUS.ERROR, error: { code: 'FORBIDDEN' } })
  })
})

describe('useChat: enviar', () => {
  const SAVED = (clientId) => message(3, { sender: USER, text: 'Hola', clientId })

  it('muestra el mensaje como pendiente de inmediato y lo confirma con el ack del socket', async () => {
    const ack = deferred()
    socketService.sendChatMessage.mockReturnValue(ack.promise)
    const { result } = await setup()

    await act(async () => result.current.send('  Hola  '))

    const [pending] = result.current.messages
    expect(pending).toMatchObject({ text: 'Hola', status: 'pending', sender: USER })
    expect(pending.clientId).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(socketService.sendChatMessage).toHaveBeenCalledWith({ planId: 'p1', text: 'Hola', clientId: pending.clientId })

    await act(async () => ack.resolve(SAVED(pending.clientId)))

    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages[0]).toMatchObject({ id: 'm3', status: 'sent' })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('si el broadcast llega antes que el ack, reemplaza al pendiente y el ack no lo duplica', async () => {
    const ack = deferred()
    socketService.sendChatMessage.mockReturnValue(ack.promise)
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    const { clientId } = result.current.messages[0]

    await socket.receive(SAVED(clientId))
    expect(result.current.messages.filter((item) => item.text === 'Hola')).toHaveLength(1)
    await act(async () => ack.resolve(SAVED(clientId)))

    expect(result.current.messages).toHaveLength(3)
    expect(result.current.messages[0].status).toBe('sent')
  })

  it('no manda mensajes vacíos o con solo espacios', async () => {
    const { result } = await setup()

    await act(async () => { result.current.send('   '); result.current.send('') })

    expect(socketService.sendChatMessage).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(2)
  })

  it.each([
    ['no hay conexión', CLIENT_ERROR_CODES.NETWORK_ERROR],
    ['el ack no llega', CLIENT_ERROR_CODES.TIMEOUT]
  ])('si %s lo manda por REST con el MISMO clientId', async (_case, code) => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, code))
    sendMessage.mockImplementation(async (planId, { clientId }) => SAVED(clientId))
    const { result } = await setup()

    await act(async () => result.current.send('Hola'))

    const socketCall = socketService.sendChatMessage.mock.calls[0][0]
    expect(sendMessage).toHaveBeenCalledWith('p1', { text: 'Hola', clientId: socketCall.clientId })
    expect(result.current.messages[0]).toMatchObject({ id: 'm3', status: 'sent' })
  })

  it('un error del servidor por el socket (p. ej. VALIDATION_ERROR) marca el mensaje como fallido sin reintentar por REST', async () => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, 'VALIDATION_ERROR'))
    const { result } = await setup()

    await act(async () => result.current.send('Hola'))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.messages[0]).toMatchObject({ status: 'failed', error: { code: 'VALIDATION_ERROR' } })
    expect(result.current.status).toBe(CHAT_STATUS.READY)
  })

  it.each(['FORBIDDEN', 'NOT_FOUND'])('si al enviar responde %s (perdió el acceso) el chat pasa a error', async (code) => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, code))
    const { result } = await setup()

    await act(async () => result.current.send('Hola'))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ status: CHAT_STATUS.ERROR, error: { code } })
  })

  it('si también falla el REST queda en la cola de pendientes y se manda solo cuando vuelve la red', async () => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR))
    sendMessage.mockRejectedValue(networkError())
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    expect(result.current.messages[0]).toMatchObject({ status: 'pending', queued: true, error: null })
    const { clientId } = result.current.messages[0]
    expect(await outbox.list()).toEqual([expect.objectContaining({ type: 'message', payload: expect.objectContaining({ planId: 'p1', text: 'Hola', clientId }) })])

    sendMessage.mockImplementation(async (planId, body) => SAVED(body.clientId))
    await act(async () => outbox.flush())

    expect(sendMessage).toHaveBeenLastCalledWith('p1', { text: 'Hola', clientId })
    expect(result.current.messages[0]).toMatchObject({ id: 'm3', status: 'sent' })
    expect(result.current.messages.filter((item) => item.text === 'Hola')).toHaveLength(1)
    expect(await outbox.list()).toEqual([])
  })

  it('sin conexión ni lo intenta: va directo a la cola', async () => {
    connectivity.isOnline.mockReturnValue(false)
    const { result } = await setup()

    await act(async () => result.current.send('Offline'))

    expect(socketService.sendChatMessage).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(result.current.messages[0]).toMatchObject({ text: 'Offline', status: 'pending', queued: true })
  })

  it('si la cola recibe un rechazo del servidor, el mensaje queda fallido y retrySend lo saca de la cola y reintenta', async () => {
    connectivity.isOnline.mockReturnValue(false)
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    const { clientId } = result.current.messages[0]
    connectivity.isOnline.mockReturnValue(true)
    sendMessage.mockRejectedValueOnce(apiError(400, 'VALIDATION_ERROR'))

    await act(async () => outbox.flush())
    expect(result.current.messages[0]).toMatchObject({ status: 'failed', queued: false, error: { code: 'VALIDATION_ERROR' } })

    socketService.sendChatMessage.mockImplementation(async ({ clientId: id }) => SAVED(id))
    await act(async () => result.current.retrySend(clientId))

    expect(result.current.messages[0]).toMatchObject({ id: 'm3', status: 'sent' })
    expect(await outbox.list()).toEqual([])
  })

  it('reload conserva los mensajes que no se pudieron mandar', async () => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR))
    sendMessage.mockRejectedValue(networkError())
    const { result } = await setup()
    await act(async () => result.current.send('Sin red'))

    await act(async () => result.current.reload())

    expect(result.current.status).toBe(CHAT_STATUS.READY)
    expect(result.current.messages[0]).toMatchObject({ text: 'Sin red', status: 'pending', queued: true })
    expect(texts(result)).toEqual(['Sin red', 'Mensaje 2', 'Mensaje 1'])
  })

  it('al abrir el chat aparecen los mensajes que quedaron en la cola (p. ej. de antes de cerrar la app)', async () => {
    sendMessage.mockRejectedValue(networkError())
    await outbox.enqueue('message', { planId: 'p1', text: 'De antes', clientId: 'c-old' })
    await outbox.enqueue('message', { planId: 'otro', text: 'De otro plan', clientId: 'c-other' })

    const { result } = await setup()

    expect(texts(result)).toEqual(['De antes', 'Mensaje 2', 'Mensaje 1'])
    expect(result.current.messages[0]).toMatchObject({ clientId: 'c-old', status: 'pending', queued: true, sender: { id: 'u1' } })
  })

  it('retrySend vuelve a pendiente mientras reintenta', async () => {
    socketService.sendChatMessage.mockRejectedValueOnce(apiError(0, 'VALIDATION_ERROR'))
    const retry = deferred()
    socketService.sendChatMessage.mockReturnValueOnce(retry.promise)
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    const { clientId } = result.current.messages[0]

    await act(async () => result.current.retrySend(clientId))

    expect(result.current.messages[0]).toMatchObject({ status: 'pending', error: null })
    await act(async () => retry.resolve(SAVED(clientId)))
    expect(result.current.messages[0].status).toBe('sent')
  })

  it('retrySend ignora un mensaje que no está fallido', async () => {
    socketService.sendChatMessage.mockReturnValue(new Promise(() => {}))
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    const { clientId } = result.current.messages[0]

    await act(async () => { result.current.retrySend(clientId); result.current.retrySend('inexistente') })

    expect(socketService.sendChatMessage).toHaveBeenCalledTimes(1)
  })

  it('un pendiente que en realidad guardó el servidor se reemplaza cuando llega por el socket o al recuperar', async () => {
    socketService.sendChatMessage.mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.TIMEOUT))
    sendMessage.mockRejectedValue(networkError())
    const { result } = await setup()
    await act(async () => result.current.send('Hola'))
    const { clientId } = result.current.messages[0]
    expect(result.current.messages[0]).toMatchObject({ status: 'pending', queued: true })

    await socket.receive(SAVED(clientId))

    expect(result.current.messages.filter((item) => item.text === 'Hola')).toEqual([expect.objectContaining({ id: 'm3', status: 'sent' })])
  })
})

describe('useChat: sin conexión y moderación (S6)', () => {
  it('sin conexión muestra el último historial guardado, sin cargar anteriores', async () => {
    await readCache.save('chat:p1', page([5, 4], 'c1'))
    connectivity.isOnline.mockReturnValue(false)

    const { result } = await setup()

    expect(listMessages).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ status: CHAT_STATUS.READY, hasMore: false, savedAt: expect.any(String) })
    expect(texts(result)).toEqual(['Mensaje 5', 'Mensaje 4'])
  })

  it('si la carga falla por red usa lo guardado; al reconectar trae lo nuevo y deja de estar "sin conexión"', async () => {
    await readCache.save('chat:p1', page([4], null))
    listMessages.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(page([5, 4], 'c2'))
    const { result } = await setup()
    expect(result.current.savedAt).not.toBeNull()

    await socket.setStatus('connected')

    await waitFor(() => expect(result.current.savedAt).toBeNull())
    expect(texts(result)).toEqual(['Mensaje 5', 'Mensaje 4'])
    expect(result.current.hasMore).toBe(true)
  })

  it('sin conexión y sin nada guardado, error de red', async () => {
    listMessages.mockRejectedValue(networkError())

    const { result } = await setup()

    expect(result.current).toMatchObject({ status: CHAT_STATUS.ERROR, error: { code: CLIENT_ERROR_CODES.NETWORK_ERROR } })
  })

  it('chat:hidden saca el mensaje de la lista', async () => {
    const { result } = await setup()

    await socket.hide('m2')

    expect(texts(result)).toEqual(['Mensaje 1'])
  })

  it('con la app en segundo plano suelta el socket y no hace polling; al volver se reconecta', async () => {
    jest.useFakeTimers()
    const listeners = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      listeners.push(listener)
      return { remove: jest.fn() }
    })
    try {
      const { result } = await setup()
      await socket.setStatus('unavailable')
      expect(result.current.isPolling).toBe(true)

      await act(async () => listeners.forEach((listener) => listener('background')))
      const calls = listMessages.mock.calls.length
      await act(async () => jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3))

      expect(socket.unsubscribe).toHaveBeenCalled()
      expect(result.current.isPolling).toBe(false)
      expect(listMessages).toHaveBeenCalledTimes(calls)

      await act(async () => listeners.forEach((listener) => listener('active')))
      expect(socketService.subscribe).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('useChat: notas de voz y URL firmada', () => {
  const url = (signature) => `https://bucket.s3.amazonaws.com/messages/a.m4a?X-Amz-Signature=${signature}`
  const voice = (signature) => message(1, { type: 'voice', text: null, durationMs: 4000, audioUrl: url(signature) })

  it('el polling no cambia la URL de una nota que ya está; refreshAudio sí pide una firmada nueva', async () => {
    listMessages.mockResolvedValue({ items: [voice('uno')], nextCursor: null })
    const { result } = await setup()
    listMessages.mockResolvedValue({ items: [voice('dos')], nextCursor: null })

    await socket.setStatus('connected')
    const polled = result.current.messages[0]
    expect(polled.audioUrl).toBe(url('uno'))

    await act(async () => { await result.current.refreshAudio() })
    expect(result.current.messages[0].audioUrl).toBe(url('dos'))
  })
})
