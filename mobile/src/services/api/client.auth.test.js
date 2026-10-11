import MockAdapter from 'axios-mock-adapter'

import { deferred } from '../../../tests/helpers/deferred.js'
import { createApiClient } from './client.js'
import { ApiError, CLIENT_ERROR_CODES } from './errors.js'

const BASE_URL = 'http://api.test/api/v1'
const EXPIRED = { code: 'TOKEN_EXPIRED', message: 'La sesión venció', requestId: 'r-exp' }

// Sesión falsa: el access token vive en una variable y `refreshSession` lo reemplaza.
function setup ({ initialToken = 'old', refreshSession } = {}) {
  const session = { token: initialToken }
  const auth = {
    getAccessToken: jest.fn(() => session.token),
    refreshSession: jest.fn(refreshSession ?? (async () => { session.token = 'new' })),
    onSessionExpired: jest.fn()
  }
  const client = createApiClient({ baseURL: BASE_URL, auth })
  const mock = new MockAdapter(client)
  // /plans acepta solo el token nuevo: con el viejo responde TOKEN_EXPIRED.
  mock.onGet('/plans').reply((config) => (
    config.headers.get('Authorization') === 'Bearer new' ? [200, { items: [] }] : [401, EXPIRED]
  ))
  return { client, mock, auth, session }
}

const callsTo = (mock, path) => mock.history.get.filter((request) => request.url === path)
const tokensSent = (mock, path) => callsTo(mock, path).map((request) => request.headers.get('Authorization'))

describe('cliente HTTP con sesión', () => {
  it('manda el access token vigente en Authorization', async () => {
    const { client, mock } = setup({ initialToken: 'new' })

    await client.get('/plans')

    expect(tokensSent(mock, '/plans')).toEqual(['Bearer new'])
  })

  it('sin token no manda Authorization', async () => {
    const { client, mock } = setup({ initialToken: null })
    mock.onGet('/public').reply(200, {})

    await client.get('/public')

    expect(mock.history.get[0].headers.has('Authorization')).toBe(false)
  })

  it('una request con skipAuth nunca lleva Authorization (login, register, refresh)', async () => {
    const { client, mock } = setup({ initialToken: 'new' })
    mock.onPost('/auth/login').reply(200, {})

    await client.post('/auth/login', {}, { skipAuth: true })

    expect(mock.history.post[0].headers.has('Authorization')).toBe(false)
  })

  it('con el token vencido hace UN refresh y reintenta la request', async () => {
    const { client, mock, auth } = setup()

    const response = await client.get('/plans')

    expect(response.data).toEqual({ items: [] })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(tokensSent(mock, '/plans')).toEqual(['Bearer old', 'Bearer new'])
  })

  it('3 requests concurrentes con el token vencido → 1 solo refresh y 3 reintentos', async () => {
    const gate = deferred()
    const { client, mock, auth, session } = setup({ refreshSession: async () => { await gate.promise } })
    auth.refreshSession.mockImplementation(async () => { await gate.promise; session.token = 'new' })

    const requests = Promise.all([client.get('/plans'), client.get('/plans'), client.get('/plans')])
    await new Promise((resolve) => setTimeout(resolve, 10)) // las 3 reciben su 401 mientras el refresh sigue en vuelo
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    gate.resolve()
    const responses = await requests

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(tokensSent(mock, '/plans')).toEqual(['Bearer old', 'Bearer old', 'Bearer old', 'Bearer new', 'Bearer new', 'Bearer new'])
  })

  it('una request lenta que falla DESPUÉS de que otra ya refrescó solo se reintenta con el token nuevo', async () => {
    const { client, mock, auth, session } = setup()
    const slow = deferred()
    mock.onGet('/slow').reply((config) => (
      config.headers.get('Authorization') === 'Bearer new'
        ? [200, { ok: true }]
        : slow.promise.then(() => [401, EXPIRED])
    ))

    const slowRequest = client.get('/slow') // sale con el token viejo y queda esperando
    await client.get('/plans') // otra request vence, refresca y termina
    expect(session.token).toBe('new')
    slow.resolve()
    const response = await slowRequest

    expect(response.data).toEqual({ ok: true })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('después de un refresh exitoso, un nuevo vencimiento dispara otro refresh', async () => {
    const { client, auth, session } = setup()
    await client.get('/plans')
    session.token = 'old'

    await client.get('/plans')

    expect(auth.refreshSession).toHaveBeenCalledTimes(2)
  })

  it('si el refresh es rechazado (401) avisa UNA vez que la sesión terminó y las 3 requests fallan con ese error', async () => {
    const refreshError = new ApiError({ status: 401, code: 'UNAUTHENTICATED', requestId: 'r-refresh' })
    const { client, auth } = setup({ refreshSession: async () => { throw refreshError } })

    const results = await Promise.allSettled([client.get('/plans'), client.get('/plans'), client.get('/plans')])

    expect(results.map((result) => result.reason)).toEqual([refreshError, refreshError, refreshError])
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(auth.onSessionExpired).toHaveBeenCalledTimes(1)
    expect(auth.onSessionExpired).toHaveBeenCalledWith(refreshError)
  })

  it('si el refresh falla por red NO cierra la sesión: la request falla con NETWORK_ERROR', async () => {
    const networkError = new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    const { client, auth } = setup({ refreshSession: async () => { throw networkError } })

    await expect(client.get('/plans')).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    expect(auth.onSessionExpired).not.toHaveBeenCalled()
  })

  it('un 401 en la request reintentada no entra en un bucle de refresh', async () => {
    const { client, mock, auth } = setup()
    mock.onGet('/forbidden-forever').reply(401, EXPIRED)

    await expect(client.get('/forbidden-forever')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })

    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(callsTo(mock, '/forbidden-forever')).toHaveLength(2)
  })

  it('un 401 de una request skipAuth (credenciales incorrectas en el login) no dispara refresh', async () => {
    const { client, mock, auth } = setup({ initialToken: null })
    mock.onPost('/auth/login').reply(401, { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos', requestId: 'r' })

    await expect(client.post('/auth/login', {}, { skipAuth: true })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })

    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.onSessionExpired).not.toHaveBeenCalled()
  })

  it.each([
    [403, { code: 'FORBIDDEN' }],
    [409, { code: 'PLAN_FULL' }],
    [400, { code: 'VALIDATION_ERROR' }],
    [500, { code: 'INTERNAL' }]
  ])('un %i no dispara refresh', async (status, body) => {
    const { client, mock, auth } = setup({ initialToken: 'new' })
    mock.onGet('/other').reply(status, { ...body, message: 'x', requestId: 'r' })

    await expect(client.get('/other')).rejects.toMatchObject({ status })

    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('una cuenta suspendida (ACCOUNT_SUSPENDED) cierra la sesión sin intentar refresh', async () => {
    const { client, mock, auth } = setup({ initialToken: 'new' })
    mock.onGet('/other').reply(401, { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida', requestId: 'r' })

    await expect(client.get('/other')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' })

    expect(auth.refreshSession).not.toHaveBeenCalled()
    expect(auth.onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('un 401 UNAUTHENTICATED (token inválido, no vencido) también intenta refrescar', async () => {
    const { client, mock, auth } = setup()
    mock.onGet('/plans').reply((config) => (
      config.headers.get('Authorization') === 'Bearer new' ? [200, {}] : [401, { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' }]
    ))

    await client.get('/plans')

    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('sin configuración de sesión (cliente público) un 401 es solo un error', async () => {
    const client = createApiClient({ baseURL: BASE_URL })
    const mock = new MockAdapter(client)
    mock.onGet('/plans').reply(401, EXPIRED)

    await expect(client.get('/plans')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
  })
})
