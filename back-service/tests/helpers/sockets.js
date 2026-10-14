// Socket.io real sobre la app de test (adaptador en memoria: una sola instancia) y clientes `socket.io-client`.
// El caso de dos instancias con Redis se prueba contra docker-compose (scripts/chat-two-instances.js).
import { createServer } from 'node:http'
import { io as ioClient } from 'socket.io-client'
import { SOCKET_PATH, createSocketServer } from '../../src/sockets/index.js'

const ACK_TIMEOUT_MS = 2000

/**
 * Levanta el servidor HTTP + Socket.io de los módulos de test en un puerto libre.
 * @param {ReturnType<import('./modules.js').buildTestModules>} modules
 */
export async function startSocketServer (modules) {
  const httpServer = createServer(modules.app)
  const io = createSocketServer({
    httpServer,
    authService: modules.authService,
    messageService: modules.messageService,
    messageSerializer: modules.messageSerializer,
    broadcaster: modules.chatBroadcaster,
    logger: modules.logger
  })
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${httpServer.address().port}`
  const clients = []

  /** Cliente sin reconexión automática (cada test decide). */
  function connect (token) {
    const client = ioClient(url, { path: SOCKET_PATH, transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true })
    clients.push(client)
    return client
  }

  async function close () {
    clients.forEach((client) => client.disconnect())
    await new Promise((resolve) => io.close(() => resolve()))
  }

  return { url, io, connect, close }
}

/** Espera a que conecte; si el handshake falla, rechaza con el `connect_error`. */
export const connected = (client) => new Promise((resolve, reject) => {
  client.once('connect', resolve)
  client.once('connect_error', reject)
})

/** Emite con ack (rechaza si el servidor no responde a tiempo). */
export const emitAck = (client, event, payload) => client.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)

/** Próximo evento `event` que recibe el cliente. */
export const nextEvent = (client, event, timeoutMs = ACK_TIMEOUT_MS) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no llegó ${event}`)), timeoutMs)
  client.once(event, (payload) => { clearTimeout(timer); resolve(payload) })
})

/** Junta los eventos `event` que recibe el cliente (para comprobar que algo NO llegó). */
export function collectEvents (client, event) {
  const received = []
  client.on(event, (payload) => received.push(payload))
  return received
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
