// Contrato del chat por Socket.io (S5-BE-04 y 05): handshake autenticado, chat:join / chat:leave / chat:send con ack
// y chat:message a la sala. Una sola instancia con el adaptador en memoria; dos instancias con Redis: ver
// scripts/chat-two-instances.js.
import { afterEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { planBody, setupApi } from '../helpers/plans-api.js'
import { collectEvents, connected, emitAck, nextEvent, sleep, startSocketServer } from '../helpers/sockets.js'
import { Message } from '../../src/modules/messages/message.model.js'
import { User } from '../../src/modules/users/user.model.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'
const MINUTE_MS = 60 * 1000

let server = null

afterEach(async () => {
  await server?.close()
  server = null
})

/** Ana crea un plan, Beto se inscribe y Caro no. Con el servidor de sockets levantado. */
async function scenario () {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody())
  await beto.api.post(`/plans/${plan.id}/join`)
  server = await startSocketServer(api)

  /** Conecta como ese usuario y entra a la sala del plan. */
  async function joinAs (session) {
    const client = server.connect(session.token)
    await connected(client)
    expect(await emitAck(client, 'chat:join', { planId: plan.id })).toEqual({ ok: true })
    return client
  }

  return { ...api, ana, beto, caro, plan, joinAs }
}

describe('handshake', () => {
  it('sin token: connect_error UNAUTHENTICATED', async () => {
    await scenario()

    const err = await connected(server.connect(null)).catch((error) => error)

    expect(err.data).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String) })
  })

  it('con un token vencido: connect_error TOKEN_EXPIRED (la app refresca y reconecta)', async () => {
    const { beto, clock } = await scenario()
    clock.advance(16 * MINUTE_MS)

    const err = await connected(server.connect(beto.token)).catch((error) => error)

    expect(err.data.code).toBe('TOKEN_EXPIRED')
  })

  it('con un usuario suspendido: connect_error ACCOUNT_SUSPENDED', async () => {
    const { beto } = await scenario()
    await User.updateOne({ _id: beto.id }, { $set: { status: 'suspended' } })

    const err = await connected(server.connect(beto.token)).catch((error) => error)

    expect(err.data.code).toBe('ACCOUNT_SUSPENDED')
  })
})

describe('chat:join', () => {
  it('rechaza con FORBIDDEN a quien no es participante ni creador', async () => {
    const { caro, plan } = await scenario()
    const client = server.connect(caro.token)
    await connected(client)

    const ack = await emitAck(client, 'chat:join', { planId: plan.id })

    expect(ack).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String), requestId: expect.any(String) } })
  })

  it('NOT_FOUND para un plan que no existe y VALIDATION_ERROR para un payload inválido', async () => {
    const { beto } = await scenario()
    const client = server.connect(beto.token)
    await connected(client)

    expect((await emitAck(client, 'chat:join', { planId: UNKNOWN_ID })).error.code).toBe('NOT_FOUND')
    expect((await emitAck(client, 'chat:join', { planId: 'no-es-un-id' })).error.code).toBe('VALIDATION_ERROR')
    expect((await emitAck(client, 'chat:join', { planId: { $ne: null } })).error.code).toBe('VALIDATION_ERROR')
  })

  it('quien no pudo entrar a la sala no recibe los mensajes', async () => {
    const { ana, caro, plan, joinAs } = await scenario()
    const outsider = server.connect(caro.token)
    await connected(outsider)
    await emitAck(outsider, 'chat:join', { planId: plan.id })
    const received = collectEvents(outsider, 'chat:message')
    const creator = await joinAs(ana)

    await emitAck(creator, 'chat:send', { planId: plan.id, text: 'Solo para anotados', clientId: 'c1' })
    await sleep(100)

    expect(received).toHaveLength(0)
  })
})

describe('chat:send', () => {
  it('guarda el mensaje, responde por ack y lo emite a toda la sala (incluido quien lo mandó)', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    const creator = await joinAs(ana)
    const participant = await joinAs(beto)
    const toCreator = nextEvent(creator, 'chat:message')
    const toSender = nextEvent(participant, 'chat:message')

    const ack = await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Llego 10 min tarde', clientId: 'c-1' })

    expect(ack).toEqual({
      ok: true,
      message: {
        id: expect.any(String),
        planId: plan.id,
        sender: { id: beto.id, name: 'Beto', photoUrl: null, reputation: 0 },
        type: 'text',
        text: 'Llego 10 min tarde',
        clientId: 'c-1',
        createdAt: expect.any(String)
      }
    })
    expect(await toCreator).toEqual(ack.message)
    expect(await toSender).toEqual(ack.message)
  })

  it('un reintento con el mismo clientId devuelve el mismo mensaje, sin duplicarlo ni volver a emitirlo', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    const creator = await joinAs(ana)
    const participant = await joinAs(beto)
    const received = collectEvents(creator, 'chat:message')

    const first = await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola', clientId: 'retry-1' })
    const retry = await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola', clientId: 'retry-1' })
    await sleep(100)

    expect(retry.message.id).toBe(first.message.id)
    expect(await Message.countDocuments()).toBe(1)
    expect(received).toHaveLength(1)
  })

  it('texto vacío o de más de 2000 caracteres: VALIDATION_ERROR y no guarda nada', async () => {
    const { beto, plan, joinAs } = await scenario()
    const participant = await joinAs(beto)

    expect((await emitAck(participant, 'chat:send', { planId: plan.id, text: '   ' })).error.code).toBe('VALIDATION_ERROR')
    expect((await emitAck(participant, 'chat:send', { planId: plan.id, text: 'a'.repeat(2001) })).error.code).toBe('VALIDATION_ERROR')
    expect((await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola', senderId: UNKNOWN_ID })).error.code).toBe('VALIDATION_ERROR')
    expect(await Message.countDocuments()).toBe(0)
  })

  it('un no participante no puede mandar aunque no haya hecho chat:join (FORBIDDEN)', async () => {
    const { caro, plan } = await scenario()
    const client = server.connect(caro.token)
    await connected(client)

    const ack = await emitAck(client, 'chat:send', { planId: plan.id, text: 'Hola' })

    expect(ack.error.code).toBe('FORBIDDEN')
    expect(await Message.countDocuments()).toBe(0)
  })

  it('un usuario suspendido con la conexión abierta: ACCOUNT_SUSPENDED y se cierra la conexión', async () => {
    const { beto, plan, joinAs } = await scenario()
    const participant = await joinAs(beto)
    await User.updateOne({ _id: beto.id }, { $set: { status: 'suspended' } })
    const disconnected = nextEvent(participant, 'disconnect')

    const ack = await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola' })

    expect(ack.error.code).toBe('ACCOUNT_SUSPENDED')
    await disconnected
    expect(await Message.countDocuments()).toBe(0)
  })
})

describe('REST y Socket.io comparten el chat', () => {
  it('un mensaje enviado por POST /plans/:id/messages llega a la sala', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    const creator = await joinAs(ana)
    const incoming = nextEvent(creator, 'chat:message')

    const { body } = await beto.api.post(`/plans/${plan.id}/messages`, { text: 'Por REST', clientId: 'rest-1' })

    expect(await incoming).toEqual(body)
  })

  it('el mismo clientId por socket y después por REST (fallback) es un solo mensaje', async () => {
    const { beto, plan, joinAs } = await scenario()
    const participant = await joinAs(beto)

    const ack = await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola', clientId: 'both-1' })
    const res = await beto.api.post(`/plans/${plan.id}/messages`, { text: 'Hola', clientId: 'both-1' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(ack.message.id)
    expect(await Message.countDocuments()).toBe(1)
  })
})

describe('chat:leave y bajas', () => {
  it('después de chat:leave no llegan más mensajes', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    const creator = await joinAs(ana)
    const participant = await joinAs(beto)
    const received = collectEvents(participant, 'chat:message')

    expect(await emitAck(participant, 'chat:leave', { planId: plan.id })).toEqual({ ok: true })
    await emitAck(creator, 'chat:send', { planId: plan.id, text: 'Hola' })
    await sleep(100)

    expect(received).toHaveLength(0)
  })

  it('al darse de baja del plan sale de la sala aunque la conexión siga abierta', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    const creator = await joinAs(ana)
    const participant = await joinAs(beto)
    const received = collectEvents(participant, 'chat:message')

    expect((await beto.api.delete(`/plans/${plan.id}/join`)).status).toBe(204)
    await sleep(50)
    await emitAck(creator, 'chat:send', { planId: plan.id, text: 'Ya no lo ve' })
    await sleep(100)

    expect(received).toHaveLength(0)
    expect((await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola' })).error.code).toBe('FORBIDDEN')
  })

  it('el creador que se inscribió y se da de baja sigue en el chat', async () => {
    const { ana, beto, plan, joinAs } = await scenario()
    await ana.api.post(`/plans/${plan.id}/join`)
    const creator = await joinAs(ana)
    const participant = await joinAs(beto)
    await ana.api.delete(`/plans/${plan.id}/join`)
    await sleep(50)
    const incoming = nextEvent(creator, 'chat:message')

    await emitAck(participant, 'chat:send', { planId: plan.id, text: 'Hola' })

    expect((await incoming).text).toBe('Hola')
  })
})
