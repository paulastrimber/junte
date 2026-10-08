import MockAdapter from 'axios-mock-adapter'

import { createApiClient, toApiError } from './client.js'
import { ApiError, CLIENT_ERROR_CODES } from './errors.js'

const BASE_URL = 'http://api.test/api/v1'

function setup () {
  const client = createApiClient({ baseURL: BASE_URL, timeout: 50 })
  const mock = new MockAdapter(client)
  return { client, mock }
}

async function captureError (promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Se esperaba que la request fallara')
}

describe('createApiClient', () => {
  it('usa la baseURL y devuelve la respuesta en el camino feliz', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(200, { status: 'ok' })

    const response = await client.get('/health')

    expect(client.defaults.baseURL).toBe(BASE_URL)
    expect(response.data).toEqual({ status: 'ok' })
  })

  it('mapea un 409 con cuerpo del catálogo respetando code, message y requestId', async () => {
    const { client, mock } = setup()
    mock.onPost('/plans/1/join').reply(409, {
      code: 'PLAN_FULL',
      message: 'El plan no tiene cupos disponibles',
      requestId: 'req-body'
    }, { 'x-request-id': 'req-header' })

    const error = await captureError(client.post('/plans/1/join'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'PLAN_FULL',
      message: 'El plan no tiene cupos disponibles',
      requestId: 'req-body'
    })
  })

  it('conserva details de un VALIDATION_ERROR', async () => {
    const { client, mock } = setup()
    const details = [{ path: 'capacity', message: 'Debe ser un entero positivo' }]
    mock.onPost('/plans').reply(400, { code: 'VALIDATION_ERROR', message: 'Datos inválidos', requestId: 'r1', details })

    const error = await captureError(client.post('/plans', {}))

    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details })
  })

  it('mapea un 503 con cuerpo del catálogo', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(503, { code: 'INTERNAL', message: 'Servicio no disponible', requestId: 'req-503' })

    const error = await captureError(client.get('/health'))

    expect(error).toMatchObject({ status: 503, code: 'INTERNAL', message: 'Servicio no disponible', requestId: 'req-503' })
  })

  it('mapea un 503 sin cuerpo a INTERNAL con mensaje por defecto y requestId del header', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(503, undefined, { 'X-Request-Id': 'req-header-503' })

    const error = await captureError(client.get('/health'))

    expect(error.status).toBe(503)
    expect(error.code).toBe('INTERNAL')
    expect(error.message).toMatch(/servidor/i)
    expect(error.requestId).toBe('req-header-503')
  })

  it('mapea un error de red a status 0 y NETWORK_ERROR', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').networkError()

    const error = await captureError(client.get('/health'))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR, requestId: null })
    expect(error.message).toMatch(/conexión/i)
  })

  it('mapea un timeout a status 0 y TIMEOUT', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').timeout()

    const error = await captureError(client.get('/health'))

    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.TIMEOUT, requestId: null })
  })

  it('una request abortada por el navegador/SO (ECONNABORTED) cuenta como error de red, no como timeout', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').abortRequest()

    const error = await captureError(client.get('/health'))

    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  })

  it('una request cancelada desde la app da REQUEST_CANCELED', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(200, { status: 'ok' })
    const controller = new AbortController()
    controller.abort()

    const error = await captureError(client.get('/health', { signal: controller.signal }))

    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.REQUEST_CANCELED })
  })

  it('un cuerpo JSON sin code usa el código por status y toma el requestId del header', async () => {
    const { client, mock } = setup()
    mock.onGet('/plans/x').reply(404, { error: 'Not Found' }, { 'x-request-id': 'req-404' })

    const error = await captureError(client.get('/plans/x'))

    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', requestId: 'req-404' })
    expect(error.message).toBe('No encontramos lo que buscabas.')
  })

  it('un 429 de Nginx sin code se mapea a RATE_LIMITED', async () => {
    const { client, mock } = setup()
    mock.onPost('/auth/login').reply(429, '')

    const error = await captureError(client.post('/auth/login'))

    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED' })
  })

  it('un cuerpo no JSON (HTML de un 502) se mapea a INTERNAL', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(502, '<html><body>502 Bad Gateway</body></html>', { 'x-request-id': 'req-502' })

    const error = await captureError(client.get('/health'))

    expect(error).toMatchObject({ status: 502, code: 'INTERNAL', requestId: 'req-502' })
    expect(error.message).not.toMatch(/html/i)
  })

  it('un cuerpo JSON como string (sin parsear) igual se lee', async () => {
    const { client, mock } = setup()
    mock.onGet('/plans/1').reply(403, JSON.stringify({ code: 'FORBIDDEN', message: 'Sin permiso', requestId: 'r-403' }))

    const error = await captureError(client.get('/plans/1'))

    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'Sin permiso', requestId: 'r-403' })
  })

  it('un status sin código genérico y sin cuerpo da UNKNOWN_ERROR', async () => {
    const { client, mock } = setup()
    mock.onPost('/uploads/presign').reply(413)

    const error = await captureError(client.post('/uploads/presign'))

    expect(error).toMatchObject({ status: 413, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR, requestId: null })
  })
})

describe('toApiError', () => {
  it('devuelve el mismo ApiError si ya lo es', () => {
    const original = new ApiError({ status: 409, code: 'PLAN_FULL', message: 'x', requestId: 'r' })
    expect(toApiError(original)).toBe(original)
  })

  it('no expone el mensaje de un error de programación', () => {
    const error = toApiError(new TypeError('cannot read properties of undefined'))
    expect(error).toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.UNKNOWN_ERROR })
    expect(error.message).not.toMatch(/undefined/)
  })
})
