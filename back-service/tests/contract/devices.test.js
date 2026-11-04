// Contrato de POST /devices y DELETE /devices/:token (S5-BE-06).
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, setupApi } from '../helpers/plans-api.js'
import { DeviceToken } from '../../src/modules/devices/index.js'

useTestDb()

const TOKEN = 'fcm-token_abc:APA91bH-1234567890'

async function scenario () {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana', profile: null })
  const beto = await api.signUp({ name: 'Beto', profile: null })
  return { ...api, ana, beto }
}

describe('POST /devices', () => {
  it('201 la primera vez, 200 al repetirlo; un solo registro, del usuario del token', async () => {
    const { ana } = await scenario()

    const first = await ana.api.post('/devices', { token: TOKEN, platform: 'android' })
    const again = await ana.api.post('/devices', { token: TOKEN, platform: 'android' })

    expect(first.status).toBe(201)
    expect(first.body).toEqual({ token: TOKEN, platform: 'android' })
    expect(again.status).toBe(200)
    const docs = await DeviceToken.find().lean()
    expect(docs).toHaveLength(1)
    expect(String(docs[0].userId)).toBe(ana.id)
  })

  it('el mismo token desde otra cuenta se reasigna al usuario del JWT', async () => {
    const { ana, beto } = await scenario()
    await ana.api.post('/devices', { token: TOKEN, platform: 'android' })

    expect((await beto.api.post('/devices', { token: TOKEN, platform: 'android' })).status).toBe(200)

    const docs = await DeviceToken.find().lean()
    expect(docs).toHaveLength(1)
    expect(String(docs[0].userId)).toBe(beto.id)
  })

  it('400 con plataforma desconocida, token inválido o userId en el body; 401 sin token', async () => {
    const { ana, beto, anonymous } = await scenario()

    expectValidationError(await ana.api.post('/devices', { token: TOKEN, platform: 'web' }), expect)
    expectValidationError(await ana.api.post('/devices', { token: 'con espacios', platform: 'ios' }), expect)
    expectValidationError(await ana.api.post('/devices', { token: '', platform: 'ios' }), expect)
    expectValidationError(await ana.api.post('/devices', { token: TOKEN, platform: 'ios', userId: beto.id }), expect)
    expectError(await anonymous.post('/devices', { token: TOKEN, platform: 'ios' }), expect, 401, 'UNAUTHENTICATED')
    expect(await DeviceToken.countDocuments()).toBe(0)
  })
})

describe('DELETE /devices/:token', () => {
  it('204 y borra el token; también si ya no existía', async () => {
    const { ana } = await scenario()
    await ana.api.post('/devices', { token: TOKEN, platform: 'ios' })

    expect((await ana.api.delete(`/devices/${encodeURIComponent(TOKEN)}`)).status).toBe(204)
    expect((await ana.api.delete(`/devices/${encodeURIComponent(TOKEN)}`)).status).toBe(204)
    expect(await DeviceToken.countDocuments()).toBe(0)
  })

  it('403 si el token es de otro usuario, y no lo borra', async () => {
    const { ana, beto } = await scenario()
    await ana.api.post('/devices', { token: TOKEN, platform: 'ios' })

    expectError(await beto.api.delete(`/devices/${encodeURIComponent(TOKEN)}`), expect, 403, 'FORBIDDEN')
    expect(await DeviceToken.countDocuments()).toBe(1)
  })
})
