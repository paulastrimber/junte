// Casos del servidor de sockets que con la base real no se pueden forzar: una baja que termina justo entre la
// verificación de `chat:join` y el join a la sala, y un error inesperado en el handshake.
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { io as ioClient } from 'socket.io-client'
import { AppError } from '../shared/errors.js'
import { createChatBroadcaster, planRoom } from './chat.broadcaster.js'
import { SOCKET_PATH, createSocketServer } from './index.js'

const USER_ID = '665f1c2a9b1e8a0012345678'
const PLAN_ID = '885f1c2a9b1e8a001234567a'

let close = async () => {}

afterEach(async () => {
  await close()
  close = async () => {}
})

async function start ({ authenticate = async () => ({ user: { id: USER_ID } }), requireMember = async () => ({}) } = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const httpServer = createServer()
  const io = createSocketServer({
    httpServer,
    authService: { authenticate, assertActive: async () => {} },
    messageService: { requireMember, send: vi.fn() },
    messageSerializer: { serialize: async () => ({}) },
    broadcaster: createChatBroadcaster({ serializeMessage: async () => ({}), logger }),
    logger
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const client = ioClient(`http://127.0.0.1:${httpServer.address().port}`, {
    path: SOCKET_PATH, transports: ['websocket'], auth: { token: 'token' }, reconnection: false, forceNew: true
  })
  close = async () => {
    client.disconnect()
    await new Promise((resolve) => io.close(() => resolve()))
  }
  return { io, client, logger }
}

const connected = (client) => new Promise((resolve, reject) => {
  client.once('connect', resolve)
  client.once('connect_error', reject)
})

describe('chat:join', () => {
  it('si la baja termina entre la verificación y el join, responde FORBIDDEN y no deja el socket en la sala', async () => {
    const requireMember = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new AppError('FORBIDDEN', 'Ya no estás en el plan'))
    const { io, client } = await start({ requireMember })
    await connected(client)

    const ack = await client.timeout(2000).emitWithAck('chat:join', { planId: PLAN_ID })

    expect(ack.error.code).toBe('FORBIDDEN')
    expect(await io.in(planRoom(PLAN_ID)).fetchSockets()).toHaveLength(0)
  })

  it('el log del evento solo lleva un planId con forma válida', async () => {
    const { client, logger } = await start()
    await connected(client)

    await client.timeout(2000).emitWithAck('chat:join', { planId: 'x'.repeat(500) })

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'chat:join', planId: undefined, code: 'VALIDATION_ERROR' }), 'socket event')
  })
})

describe('handshake', () => {
  it('un error inesperado se loguea como error y el cliente recibe INTERNAL sin detalles', async () => {
    const { client, logger } = await start({ authenticate: async () => { throw new Error('mongo down') } })

    const err = await connected(client).catch((error) => error)

    expect(err.data).toEqual({ code: 'INTERNAL', message: 'Ocurrió un error inesperado' })
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'socket.handshake', status: 'error' }), 'socket handshake failed')
  })

  it('un rechazo esperado se loguea como info con su código', async () => {
    const { client, logger } = await start({ authenticate: async () => { throw new AppError('TOKEN_EXPIRED', 'Tu sesión venció') } })

    await connected(client).catch(() => {})

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'socket.handshake', code: 'TOKEN_EXPIRED' }), 'socket handshake rejected')
    expect(logger.error).not.toHaveBeenCalled()
  })
})
