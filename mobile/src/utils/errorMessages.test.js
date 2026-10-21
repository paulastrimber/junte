import { AxiosError } from 'axios'
import MockAdapter from 'axios-mock-adapter'

import { createApiClient } from '../services/api/client.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { CHAT_ERROR_MESSAGES, toViewError } from './errorMessages.js'

const NETWORK_TEXT = 'No pudimos conectarnos con el servidor. Revisá tu conexión.'
const GENERIC_TEXT = 'Ocurrió un error inesperado. Probá de nuevo.'

// Lo que de verdad llega a un hook: la falla de una request hecha con el cliente de la app.
async function failureFrom (configure) {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  const mock = new MockAdapter(client)
  configure(mock)
  try {
    await client.get('/plans')
  } catch (error) {
    return error
  }
  throw new Error('la request no falló')
}

describe('toViewError (S6-MOB-05)', () => {
  describe('con un ApiError (respuesta del servidor)', () => {
    it('elige el texto por code, conserva el requestId y no agrega nada más', async () => {
      const failure = await failureFrom((mock) => mock.onGet('/plans').reply(401, { code: 'INVALID_CREDENTIALS', message: 'Bad credentials', requestId: 'req-9' }))

      expect(failure).toBeInstanceOf(ApiError)
      expect(toViewError(failure)).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.', requestId: 'req-9' })
    })

    it('sin texto propio para el code usa el message del servidor; los overrides de la acción mandan', async () => {
      const failure = await failureFrom((mock) => mock.onGet('/plans').reply(409, { code: 'PLAN_FULL', message: 'El plan no tiene cupos', requestId: 'req-1' }))

      expect(toViewError(failure).message).toBe('El plan no tiene cupos')
      expect(toViewError(failure, { PLAN_FULL: 'El plan se llenó.' }).message).toBe('El plan se llenó.')
    })

    it('un 502 de Nginx sin cuerpo JSON es INTERNAL, con texto propio y el requestId del header', async () => {
      const failure = await failureFrom((mock) => mock.onGet('/plans').reply(502, '<html>Bad Gateway</html>', { 'x-request-id': 'nginx-7' }))

      expect(toViewError(failure)).toEqual({ code: 'INTERNAL', message: 'Ocurrió un error en el servidor. Probá más tarde.', requestId: 'nginx-7' })
    })

    it('el chat tiene sus propios textos para FORBIDDEN', () => {
      expect(toViewError(new ApiError({ status: 403, code: 'FORBIDDEN' }), CHAT_ERROR_MESSAGES).message).toBe(CHAT_ERROR_MESSAGES.FORBIDDEN)
    })
  })

  describe('con un error de red', () => {
    it('por el cliente de la app: NETWORK_ERROR con el texto de conexión y sin requestId', async () => {
      const failure = await failureFrom((mock) => mock.onGet('/plans').networkError())

      expect(toViewError(failure)).toEqual({ code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: NETWORK_TEXT, requestId: null })
    })

    it('un timeout se explica como tal', async () => {
      const failure = await failureFrom((mock) => mock.onGet('/plans').timeout())

      expect(toViewError(failure)).toEqual({ code: CLIENT_ERROR_CODES.TIMEOUT, message: 'El servidor tardó demasiado en responder. Probá de nuevo.', requestId: null })
    })

    // BUG-QA-2: `toViewError` documenta que acepta "un error de axios", pero si recibe uno crudo (de un cliente sin el
    // interceptor, p. ej. la subida a S3 o un service nuevo) devuelve `code: NETWORK_ERROR` con el texto GENÉRICO:
    // el code y el mensaje se contradicen. Esperado: el mismo texto que con el ApiError equivalente.
    it('un error de axios crudo (sin pasar por el interceptor) da el mismo texto que el ApiError equivalente', () => {
      const raw = new AxiosError('Network Error', AxiosError.ERR_NETWORK)

      expect(toViewError(raw)).toEqual({ code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: NETWORK_TEXT, requestId: null })
    })
  })

  describe('con un error de programación', () => {
    it.each([
      ['TypeError', new TypeError("Cannot read properties of undefined (reading 'items')")],
      ['un string tirado a mano', 'boom'],
      ['undefined', undefined]
    ])('%s: UNKNOWN_ERROR con el texto genérico, sin exponer el mensaje interno', (_case, failure) => {
      const viewError = toViewError(failure)

      expect(viewError).toEqual({ code: CLIENT_ERROR_CODES.UNKNOWN_ERROR, message: GENERIC_TEXT, requestId: null })
    })
  })
})
