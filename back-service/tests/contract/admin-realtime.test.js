// Tiempo real de la moderación (S6-BE-02): ocultar un mensaje emite `chat:hidden` a la sala del plan, y suspender una
// cuenta cierra sus conexiones de Socket.io (al reconectar, el handshake la rechaza).
import { afterEach, describe, expect, it } from 'vitest'
import { User } from '../../src/modules/users/user.model.js'
import { useTestDb } from '../helpers/db.js'
import { planBody, setupApi } from '../helpers/plans-api.js'
import { connected, emitAck, nextEvent, startSocketServer } from '../helpers/sockets.js'

useTestDb()

let server = null

afterEach(async () => {
  await server?.close()
  server = null
})

async function scenario () {
  const api = setupApi()
  const admin = await api.signUp({ name: 'Admin' })
  await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } })
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const { body: plan } = await ana.api.post('/plans', planBody())
  await beto.api.post(`/plans/${plan.id}/join`)
  server = await startSocketServer(api)

  async function joinAs (session) {
    const client = server.connect(session.token)
    await connected(client)
    expect(await emitAck(client, 'chat:join', { planId: plan.id })).toEqual({ ok: true })
    return client
  }

  return { ...api, admin, ana, beto, plan, joinAs }
}

describe('moderación en tiempo real', () => {
  it('ocultar un mensaje emite chat:hidden a la sala del plan', async () => {
    const { admin, ana, beto, plan, joinAs } = await scenario()
    const client = await joinAs(beto)
    const { body: message } = await ana.api.post(`/plans/${plan.id}/messages`, { text: 'Algo feo' })

    const hidden = nextEvent(client, 'chat:hidden')
    await admin.api.patch(`/admin/messages/${message.id}`, { status: 'hidden' })

    expect(await hidden).toEqual({ planId: plan.id, messageId: message.id })
  })

  it('suspender cierra las conexiones abiertas del usuario y no lo deja reconectar', async () => {
    const { admin, beto, joinAs } = await scenario()
    const client = await joinAs(beto)

    const disconnected = nextEvent(client, 'disconnect')
    await admin.api.patch(`/admin/users/${beto.id}`, { status: 'suspended' })

    expect(await disconnected).toBe('io server disconnect')
    const err = await connected(server.connect(beto.token)).catch((error) => error)
    expect(err.data.code).toBe('ACCOUNT_SUSPENDED')
  })
})
