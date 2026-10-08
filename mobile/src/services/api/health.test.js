import MockAdapter from 'axios-mock-adapter'

import { createApiClient } from './client.js'
import { ApiError, CLIENT_ERROR_CODES } from './errors.js'
import { getHealth, HEALTH_STATUS } from './health.js'

function setup () {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  const mock = new MockAdapter(client)
  return { client, mock }
}

describe('getHealth', () => {
  it('200 → ok con el requestId del header', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(200, { status: 'ok' }, { 'x-request-id': 'req-ok' })

    await expect(getHealth({ client })).resolves.toEqual({ status: HEALTH_STATUS.OK, requestId: 'req-ok' })
  })

  it('503 → degradado (no lanza)', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').reply(503, { code: 'INTERNAL', message: 'MongoDB no responde', requestId: 'req-503' })

    const result = await getHealth({ client })

    expect(result.status).toBe(HEALTH_STATUS.DEGRADED)
    expect(result.requestId).toBe('req-503')
    expect(result.error).toBeInstanceOf(ApiError)
  })

  it('otros errores se propagan como ApiError', async () => {
    const { client, mock } = setup()
    mock.onGet('/health').networkError()

    await expect(getHealth({ client })).rejects.toMatchObject({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  })
})
