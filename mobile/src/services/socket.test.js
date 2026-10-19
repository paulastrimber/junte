import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'
import { SOCKET_STATUS, createSocketService } from './socket.js'

// Socket falso: guarda los manejadores y los emits con ack para que el test los dispare a mano.
function createFakeSocket (url, options) {
  const handlers = new Map()
  const socket = {
    url,
    options,
    connected: false,
    // Como socket.io-client: true mientras el Manager reintenta solo; un rechazo del servidor lo deja en false.
    active: true,
    emitted: [],
    on: jest.fn((event, handler) => { handlers.set(event, handler); return socket }),
    removeAllListeners: jest.fn(() => handlers.clear()),
    connect: jest.fn(),
    disconnect: jest.fn(() => { socket.connected = false }),
    emit: jest.fn(),
    timeout: jest.fn((ms) => ({ emit: (event, payload, ack) => socket.emitted.push({ event, payload, ack, ms }) })),
    fire: (event, ...args) => handlers.get(event)?.(...args),
    open: () => { socket.connected = true; socket.fire('connect') },
    drop: (reason = 'transport close') => { socket.connected = false; socket.fire('disconnect', reason) },
    rejectWith: (code) => { socket.active = false; return socket.fire('connect_error', Object.assign(new Error('rechazado'), { data: { code, message: 'Rechazado' } })) },
    failTransport: () => socket.fire('connect_error', new Error('websocket error')),
    // Contesta el último emit de ese evento.
    answer: (event, ...ackArgs) => socket.emitted.filter((item) => item.event === event).at(-1).ack(...ackArgs),
    count: (event) => socket.emitted.filter((item) => item.event === event).length
  }
  return socket
}

// AppState falso: el test dispara los cambios de primer / segundo plano.
function createFakeAppState () {
  const listeners = new Set()
  return {
    addEventListener: jest.fn((_event, listener) => {
      listeners.add(listener)
      return { remove: () => listeners.delete(listener) }
    }),
    change: (state) => listeners.forEach((listener) => listener(state)),
    count: () => listeners.size
  }
}

function setup (overrides = {}) {
  const sockets = []
  const appState = createFakeAppState()
  const io = jest.fn((url, options) => {
    const socket = createFakeSocket(url, options)
    sockets.push(socket)
    return socket
  })
  const session = { token: 'access-1' }
  const auth = {
    getAccessToken: jest.fn(() => session.token),
    refreshSession: jest.fn(async () => { session.token = 'access-2' }),
    onSessionExpired: jest.fn()
  }
  const service = createSocketService({ io, getApiUrl: () => 'http://10.0.2.2:8080/api/v1', auth, ackTimeoutMs: 8000, appState, ...overrides })
  const current = () => sockets.at(-1)
  return { service, io, auth, session, sockets, current, appState }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))
const MESSAGE = { id: 'm1', planId: 'p1', text: 'Hola', clientId: 'c1' }

describe('conexión', () => {
  it('es perezosa: no conecta hasta el primer uso', () => {
    const { service, io } = setup()

    expect(io).not.toHaveBeenCalled()
    expect(service.getStatus()).toBe(SOCKET_STATUS.IDLE)
  })

  it('conecta al origen de la API con la ruta del chat, solo websocket y el token vigente', () => {
    const { service, io, current, session } = setup()

    service.subscribe('p1', jest.fn())

    expect(io).toHaveBeenCalledTimes(1)
    expect(current().url).toBe('http://10.0.2.2:8080')
    expect(current().options).toMatchObject({ path: '/api/v1/socket.io', transports: ['websocket'] })
    const callback = jest.fn()
    current().options.auth(callback)
    expect(callback).toHaveBeenCalledWith({ token: 'access-1' })
    // En una reconexión el token se vuelve a leer.
    session.token = 'access-9'
    current().options.auth(callback)
    expect(callback).toHaveBeenLastCalledWith({ token: 'access-9' })
  })

  it('reutiliza la misma conexión para varias salas', () => {
    const { service, io } = setup()

    service.subscribe('p1', jest.fn())
    service.subscribe('p2', jest.fn())

    expect(io).toHaveBeenCalledTimes(1)
  })

  it('informa el estado: conectando, conectado, reconectando y sin WebSocket tras varios errores seguidos', () => {
    const { service, current } = setup()
    const listener = jest.fn()
    service.onStatusChange(listener)

    service.subscribe('p1', jest.fn())
    expect(service.getStatus()).toBe(SOCKET_STATUS.CONNECTING)
    current().open()
    expect(service.getStatus()).toBe(SOCKET_STATUS.CONNECTED)
    current().drop()
    expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)
    current().failTransport()
    current().failTransport()
    expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)
    current().failTransport()
    expect(service.getStatus()).toBe(SOCKET_STATUS.UNAVAILABLE)
    current().open()

    expect(service.getStatus()).toBe(SOCKET_STATUS.CONNECTED)
    expect(listener.mock.calls.map(([status]) => status)).toEqual([
      SOCKET_STATUS.CONNECTING, SOCKET_STATUS.CONNECTED, SOCKET_STATUS.RECONNECTING, SOCKET_STATUS.UNAVAILABLE, SOCKET_STATUS.CONNECTED
    ])
  })

  it('conectarse corta la cuenta de errores seguidos', () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())

    current().failTransport()
    current().failTransport()
    current().open()
    current().drop()
    current().failTransport()
    current().failTransport()

    expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)
  })

  it('si el servidor corta la conexión reconecta a mano (Socket.io no lo hace solo)', () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    current().drop('io server disconnect')

    expect(current().connect).toHaveBeenCalledTimes(1)
  })

  it('un cierre propio no cuenta como caída', () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    current().drop('io client disconnect')

    expect(service.getStatus()).toBe(SOCKET_STATUS.CONNECTED)
  })
})

describe('salas y mensajes', () => {
  it('entra a la sala al conectar y vuelve a entrar después de cada reconexión', () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    expect(current().count('chat:join')).toBe(0)

    current().open()
    expect(current().emitted.at(-1)).toMatchObject({ event: 'chat:join', payload: { planId: 'p1' }, ms: 8000 })
    current().drop()
    current().open()

    expect(current().count('chat:join')).toBe(2)
  })

  it('con la conexión ya abierta entra a una sala nueva enseguida', () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    service.subscribe('p2', jest.fn())

    expect(current().emitted.at(-1)).toMatchObject({ event: 'chat:join', payload: { planId: 'p2' } })
  })

  it('entrega cada mensaje solo a quienes escuchan esa sala', () => {
    const { service, current } = setup()
    const onP1 = jest.fn()
    const onP2 = jest.fn()
    service.subscribe('p1', onP1)
    service.subscribe('p2', onP2)

    current().fire('chat:message', MESSAGE)

    expect(onP1).toHaveBeenCalledWith(MESSAGE)
    expect(onP2).not.toHaveBeenCalled()
  })

  it('avisa si el servidor no deja entrar a la sala', () => {
    const { service, current } = setup()
    const onJoinError = jest.fn()
    service.subscribe('p1', jest.fn(), onJoinError)
    current().open()

    current().answer('chat:join', null, { error: { code: 'FORBIDDEN', message: 'No', requestId: 'r1' } })

    expect(onJoinError).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN', requestId: 'r1' }))
  })

  it('si el ack de la entrada no llega lo reintenta una vez', () => {
    const { service, current } = setup()
    const onJoinError = jest.fn()
    service.subscribe('p1', jest.fn(), onJoinError)
    current().open()

    current().answer('chat:join', new Error('timeout'))
    expect(current().count('chat:join')).toBe(2)
    current().answer('chat:join', new Error('timeout'))

    expect(current().count('chat:join')).toBe(2)
    expect(onJoinError).not.toHaveBeenCalled()
  })

  it('al dejar de escuchar una sala (quedando otra) sale de ella con un ack vacío', () => {
    const { service, current } = setup()
    const leaveP1 = service.subscribe('p1', jest.fn())
    service.subscribe('p2', jest.fn())
    current().open()

    leaveP1()

    expect(current().emit).toHaveBeenCalledWith('chat:leave', { planId: 'p1' }, expect.any(Function))
    expect(current().disconnect).not.toHaveBeenCalled()
  })

  it('al soltar la última sala cierra la conexión, y se puede volver a usar', () => {
    const { service, io, current } = setup()
    const first = current
    const unsubscribe = service.subscribe('p1', jest.fn())
    const firstSocket = current()
    firstSocket.open()

    unsubscribe()
    unsubscribe()

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toBe(SOCKET_STATUS.IDLE)
    service.subscribe('p1', jest.fn())
    expect(io).toHaveBeenCalledTimes(2)
    expect(first()).not.toBe(firstSocket)
  })

  it('dos suscriptores a la misma sala entran una sola vez y la sala se suelta con el último', () => {
    const { service, current } = setup()
    const a = service.subscribe('p1', jest.fn())
    const b = service.subscribe('p1', jest.fn())
    current().open()
    expect(current().count('chat:join')).toBe(1)

    a()
    expect(current().disconnect).not.toHaveBeenCalled()
    b()

    expect(current().disconnect).toHaveBeenCalled()
  })
})

describe('sendChatMessage', () => {
  it('sin conexión rechaza con NETWORK_ERROR sin emitir nada', async () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())

    await expect(service.sendChatMessage({ planId: 'p1', text: 'Hola', clientId: 'c1' })).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })

    expect(current().count('chat:send')).toBe(0)
  })

  it('emite chat:send con timeout y resuelve con el mensaje del ack', async () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    const sending = service.sendChatMessage({ planId: 'p1', text: 'Hola', clientId: 'c1' })
    expect(current().emitted.at(-1)).toMatchObject({ event: 'chat:send', payload: { planId: 'p1', text: 'Hola', clientId: 'c1' }, ms: 8000 })
    current().answer('chat:send', null, { ok: true, message: MESSAGE })

    await expect(sending).resolves.toEqual(MESSAGE)
  })

  it('si el ack no llega a tiempo rechaza con TIMEOUT', async () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    const sending = service.sendChatMessage({ planId: 'p1', text: 'Hola', clientId: 'c1' })
    current().answer('chat:send', new Error('operation has timed out'))

    await expect(sending).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.TIMEOUT })
  })

  it('un error del servidor llega como ApiError con su código', async () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    const sending = service.sendChatMessage({ planId: 'p1', text: 'Hola', clientId: 'c1' })
    current().answer('chat:send', null, { error: { code: 'FORBIDDEN', message: 'No podés', requestId: 'r9' } })

    await expect(sending).rejects.toEqual(expect.objectContaining({ code: 'FORBIDDEN', message: 'No podés', requestId: 'r9' }))
    await expect(sending).rejects.toBeInstanceOf(ApiError)
  })

  it('un ack sin forma conocida rechaza con UNKNOWN_ERROR', async () => {
    const { service, current } = setup()
    service.subscribe('p1', jest.fn())
    current().open()

    const sending = service.sendChatMessage({ planId: 'p1', text: 'Hola', clientId: 'c1' })
    current().answer('chat:send', null, {})

    await expect(sending).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.UNKNOWN_ERROR })
  })
})

describe('token vencido', () => {
  it('renueva la sesión una vez, reconecta (con el token nuevo) y no lo cuenta como falla', async () => {
    const { service, auth, current } = setup()
    service.subscribe('p1', jest.fn())
    current().options.auth(jest.fn())

    current().rejectWith('TOKEN_EXPIRED')
    await flush()

    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(current().connect).toHaveBeenCalledTimes(1)
    const callback = jest.fn()
    current().options.auth(callback)
    expect(callback).toHaveBeenCalledWith({ token: 'access-2' })
    expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)
  })

  it('UNAUTHENTICATED también renueva', async () => {
    const { service, auth, current } = setup()
    service.subscribe('p1', jest.fn())
    current().options.auth(jest.fn())

    current().rejectWith('UNAUTHENTICATED')
    await flush()

    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('si otra request ya renovó el token solo reconecta (sin otro refresh)', async () => {
    const { service, auth, session, current } = setup()
    service.subscribe('p1', jest.fn())
    current().options.auth(jest.fn())
    session.token = 'access-2'

    current().rejectWith('TOKEN_EXPIRED')
    await flush()

    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(current().connect).toHaveBeenCalledTimes(1)
  })

  it('si el servidor lo vuelve a rechazar después de renovar, la sesión terminó', async () => {
    const { service, auth, current } = setup()
    service.subscribe('p1', jest.fn())
    const socket = current()
    socket.options.auth(jest.fn())
    socket.rejectWith('TOKEN_EXPIRED')
    await flush()

    socket.options.auth(jest.fn())
    socket.rejectWith('TOKEN_EXPIRED')
    await flush()

    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(auth.onSessionExpired).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }))
    expect(socket.disconnect).toHaveBeenCalled()
    expect(service.getStatus()).toBe(SOCKET_STATUS.IDLE)
  })

  it('si el refresh es rechazado (401) cierra la conexión y avisa que la sesión terminó', async () => {
    const { service, auth, current } = setup()
    const rejected = new ApiError({ status: 401, code: 'UNAUTHENTICATED' })
    auth.refreshSession.mockRejectedValue(rejected)
    service.subscribe('p1', jest.fn())
    const socket = current()
    socket.options.auth(jest.fn())

    socket.rejectWith('TOKEN_EXPIRED')
    await flush()

    expect(auth.onSessionExpired).toHaveBeenCalledWith(rejected)
    expect(socket.disconnect).toHaveBeenCalled()
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('si el refresh falla por red cuenta la falla y vuelve a intentar más tarde, conservando la sesión', async () => {
    jest.useFakeTimers()
    try {
      const { service, auth, current } = setup({ authRetryDelayMs: 3000 })
      auth.refreshSession.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      service.subscribe('p1', jest.fn())
      current().options.auth(jest.fn())

      current().rejectWith('TOKEN_EXPIRED')
      await jest.advanceTimersByTimeAsync(0)
      expect(auth.onSessionExpired).not.toHaveBeenCalled()
      expect(current().connect).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(3000)

      expect(current().connect).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('si el servidor rechaza la conexión por otro motivo (INTERNAL), vuelve a intentar más tarde y llega al polling', () => {
    jest.useFakeTimers()
    try {
      const { service, current } = setup({ authRetryDelayMs: 3000, maxFailures: 2 })
      service.subscribe('p1', jest.fn())

      current().rejectWith('INTERNAL')
      expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)
      expect(current().connect).not.toHaveBeenCalled()
      jest.advanceTimersByTime(3000)
      expect(current().connect).toHaveBeenCalledTimes(1)

      current().rejectWith('INTERNAL')
      expect(service.getStatus()).toBe(SOCKET_STATUS.UNAVAILABLE)
      jest.advanceTimersByTime(3000)
      expect(current().connect).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('un error de red no programa otro intento: lo reintenta Socket.io', () => {
    jest.useFakeTimers()
    try {
      const { service, current } = setup({ authRetryDelayMs: 3000 })
      service.subscribe('p1', jest.fn())

      current().failTransport()
      jest.advanceTimersByTime(10_000)

      expect(current().connect).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('cuenta suspendida: cierra y avisa sin intentar renovar', () => {
    const { service, auth, current } = setup()
    service.subscribe('p1', jest.fn())
    const socket = current()

    socket.rejectWith('ACCOUNT_SUSPENDED')

    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.onSessionExpired).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }))
    expect(socket.disconnect).toHaveBeenCalled()
  })
})

describe('disconnect (logout)', () => {
  it('cierra la conexión, olvida las salas y deja el servicio listo para un nuevo uso', () => {
    const { service, current } = setup()
    const onMessage = jest.fn()
    service.subscribe('p1', onMessage)
    const socket = current()
    socket.open()

    service.disconnect()

    expect(socket.removeAllListeners).toHaveBeenCalled()
    expect(socket.disconnect).toHaveBeenCalled()
    expect(service.getStatus()).toBe(SOCKET_STATUS.IDLE)
    expect(() => service.disconnect()).not.toThrow()
  })
})

describe('segundo plano', () => {
  it('corta la conexión al pasar a segundo plano y la retoma al volver, entrando otra vez a las salas', () => {
    const { service, current, appState } = setup()
    const listener = jest.fn()
    service.subscribe('p1', jest.fn())
    current().open()
    service.onStatusChange(listener)

    appState.change('background')
    expect(current().disconnect).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toBe(SOCKET_STATUS.RECONNECTING)

    appState.change('active')
    expect(current().connect).toHaveBeenCalledTimes(1)
    current().open()

    // Pasa por "conectado" otra vez: `useChat` recupera lo que llegó mientras tanto.
    expect(listener.mock.calls).toEqual([[SOCKET_STATUS.RECONNECTING], [SOCKET_STATUS.CONNECTED]])
    expect(current().count('chat:join')).toBe(2)
  })

  it('en segundo plano no reconecta solo (ni por un reintento programado)', async () => {
    jest.useFakeTimers()
    try {
      const { service, current, appState } = setup({ authRetryDelayMs: 1000 })
      service.subscribe('p1', jest.fn())
      current().rejectWith('INTERNAL')

      appState.change('background')
      jest.advanceTimersByTime(5000)

      expect(current().connect).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('"inactive" no corta nada, y sin salas abiertas no escucha AppState', () => {
    const { service, current, appState } = setup()
    const unsubscribe = service.subscribe('p1', jest.fn())
    current().open()

    appState.change('inactive')
    expect(current().disconnect).not.toHaveBeenCalled()

    unsubscribe()
    expect(appState.count()).toBe(0)
  })
})
