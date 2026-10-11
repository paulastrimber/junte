import MockAdapter from 'axios-mock-adapter'

import * as authApi from './auth.js'
import { createApiClient } from './client.js'
import * as uploadsApi from './uploads.js'
import * as usersApi from './users.js'

function setup () {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  return { client, mock: new MockAdapter(client) }
}

describe('api/auth', () => {
  it.each([
    ['register', '/auth/register', { name: 'Ana', email: 'ana@um.edu.uy', password: 'secreto-123' }, 201],
    ['login', '/auth/login', { email: 'ana@um.edu.uy', password: 'secreto-123' }, 200]
  ])('%s hace POST %s sin access token (skipAuth) y devuelve usuario y tokens', async (fn, path, body, status) => {
    const { client, mock } = setup()
    const payload = { user: { id: '1' }, accessToken: 'a', refreshToken: 'r' }
    mock.onPost(path).reply(status, payload)

    const result = await authApi[fn](body, { client })

    expect(result).toEqual(payload)
    expect(JSON.parse(mock.history.post[0].data)).toEqual(body)
    expect(mock.history.post[0].skipAuth).toBe(true)
  })

  it('refresh hace POST /auth/refresh con skipAuth y devuelve el par nuevo', async () => {
    const { client, mock } = setup()
    mock.onPost('/auth/refresh').reply(200, { accessToken: 'a2', refreshToken: 'r2' })

    const result = await authApi.refresh({ refreshToken: 'r1' }, { client })

    expect(result).toEqual({ accessToken: 'a2', refreshToken: 'r2' })
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ refreshToken: 'r1' })
    expect(mock.history.post[0].skipAuth).toBe(true)
  })

  it.each([
    ['logout', '/auth/logout'],
    ['logoutAll', '/auth/logout-all']
  ])('%s hace POST %s con el access token (sin skipAuth)', async (fn, path) => {
    const { client, mock } = setup()
    mock.onPost(path).reply(204)

    await authApi[fn]({ client })

    expect(mock.history.post[0].skipAuth).toBeUndefined()
  })
})

describe('api/users', () => {
  it('getMe: GET /users/me', async () => {
    const { client, mock } = setup()
    mock.onGet('/users/me').reply(200, { id: '1', name: 'Ana' })

    expect(await usersApi.getMe({ client })).toEqual({ id: '1', name: 'Ana' })
  })

  it('updateMe: PUT /users/me con los cambios', async () => {
    const { client, mock } = setup()
    mock.onPut('/users/me').reply(200, { id: '1', city: 'Montevideo' })

    const user = await usersApi.updateMe({ city: 'Montevideo' }, { client })

    expect(user.city).toBe('Montevideo')
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ city: 'Montevideo' })
  })

  it('setPhoto: PUT /users/me/photo con la clave del objeto', async () => {
    const { client, mock } = setup()
    mock.onPut('/users/me/photo').reply(200, { id: '1', photoUrl: 'https://s3/x' })

    await usersApi.setPhoto({ objectKey: 'users/1/a.jpg' }, { client })

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ objectKey: 'users/1/a.jpg' })
  })
})

describe('api/uploads', () => {
  it('presign: POST /uploads/presign con tipo y tamaño', async () => {
    const { client, mock } = setup()
    const ticket = { url: 'https://s3/put', objectKey: 'users/1/a.jpg', expiresAt: '2026-10-11T15:05:00.000Z' }
    mock.onPost('/uploads/presign').reply(200, ticket)

    const result = await uploadsApi.presign({ contentType: 'image/jpeg', sizeBytes: 1234 }, { client })

    expect(result).toEqual(ticket)
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ contentType: 'image/jpeg', sizeBytes: 1234 })
  })
})
