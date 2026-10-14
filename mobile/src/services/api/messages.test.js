import MockAdapter from 'axios-mock-adapter'

import { createApiClient } from './client.js'
import { listMessages, sendMessage } from './messages.js'

function setup () {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  return { client, mock: new MockAdapter(client) }
}

const MESSAGE = { id: 'm1', planId: 'p1', sender: { id: 'u1', name: 'Ana', photoUrl: null, reputation: 0 }, type: 'text', text: 'Hola', clientId: 'c1', createdAt: '2026-10-14T12:00:00.000Z' }

describe('api/messages', () => {
  it('listMessages: GET /plans/:id/messages con limit y cursor', async () => {
    const { client, mock } = setup()
    mock.onGet('/plans/p1/messages').reply(200, { items: [MESSAGE], nextCursor: 'abc' })

    const page = await listMessages('p1', { limit: 30, cursor: 'xyz' }, { client })

    expect(page).toEqual({ items: [MESSAGE], nextCursor: 'abc' })
    expect(mock.history.get[0].params).toEqual({ limit: 30, cursor: 'xyz' })
  })

  it('listMessages: no manda params vacíos y escapa el id', async () => {
    const { client, mock } = setup()
    mock.onGet('/plans/a%2Fb/messages').reply(200, { items: [], nextCursor: null })

    await listMessages('a/b', {}, { client })

    expect(mock.history.get[0].params).toEqual({})
  })

  it('sendMessage: POST /plans/:id/messages con el texto y el clientId, y devuelve el mensaje', async () => {
    const { client, mock } = setup()
    mock.onPost('/plans/p1/messages').reply(201, MESSAGE)

    const message = await sendMessage('p1', { text: 'Hola', clientId: 'c1' }, { client })

    expect(message).toEqual(MESSAGE)
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ text: 'Hola', clientId: 'c1' })
  })

  it('sendMessage: acepta la repetición idempotente (200) y no manda clientId si no hay', async () => {
    const { client, mock } = setup()
    mock.onPost('/plans/p1/messages').reply(200, MESSAGE)

    expect(await sendMessage('p1', { text: 'Hola' }, { client })).toEqual(MESSAGE)
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ text: 'Hola' })
  })
})
