// Servidor Socket.io del chat (S5-BE-04 y 05). docs/arquitectura/08-tiempo-real-y-push.md.
// - Solo transporte WebSocket (ADR-0003), en /internal/socket.io (Nginx publica /api/v1/socket.io).
// - El handshake se autentica con el access token, igual que el middleware HTTP (authService.authenticate).
// - Los handlers son "controladores": validan con Zod, llaman al servicio de mensajes y responden por ack.
//   Las reglas (permiso, texto, idempotencia) viven en el servicio, igual que para REST.
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { Server } from 'socket.io'
import { toAppError } from '../middlewares/errorHandler.js'
import { errors } from '../shared/errors.js'
import { objectIdField } from '../shared/validation.js'
import { chatRoomPayload, chatSendPayload } from '../modules/messages/index.js'
import { planRoom, userRoom } from './chat.broadcaster.js'

export const SOCKET_PATH = '/internal/socket.io'
// Tope del payload de un evento (el texto es de hasta 2000 caracteres): lo demás se descarta sin procesar.
const MAX_PAYLOAD_BYTES = 16 * 1024
const INTERNAL_MESSAGE = 'Ocurrió un error inesperado'
// Si el usuario dejó de estar activo, la conexión se cierra después de responder.
const CLOSE_CONNECTION_CODES = new Set(['UNAUTHENTICATED', 'ACCOUNT_SUSPENDED'])

/** Error de `connect_error` para el cliente: `err.message` y `err.data = { code, message }`. */
function handshakeError (err) {
  const known = toAppError(err)
  const code = known?.code ?? 'INTERNAL'
  const message = known?.message ?? INTERNAL_MESSAGE
  return Object.assign(new Error(message), { data: { code, message } })
}

/**
 * Monta Socket.io sobre el servidor HTTP del back.
 * @param {object} deps
 * @param {import('node:http').Server} deps.httpServer
 * @param {{ authenticate: (token: string) => Promise<{ user: { id: string } }>, assertActive: (userId: string) => Promise<void> }} deps.authService
 * @param {ReturnType<import('../modules/messages/index.js').createMessageService>} deps.messageService
 * @param {ReturnType<import('../modules/messages/index.js').createMessageSerializer>} deps.messageSerializer
 * @param {ReturnType<import('./chat.broadcaster.js').createChatBroadcaster>} deps.broadcaster
 * @param {import('pino').Logger} deps.logger
 * @param {Function} [deps.adapter]  `@socket.io/redis-adapter` en producción; sin él, el adaptador en memoria (tests).
 * @returns {import('socket.io').Server}
 */
export function createSocketServer ({ httpServer, authService, messageService, messageSerializer, broadcaster, logger, adapter }) {
  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    ...(adapter ? { adapter } : {})
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (typeof token !== 'string' || token === '') throw errors.unauthenticated()
      const { user } = await authService.authenticate(token)
      socket.data.userId = user.id
      next()
    } catch (err) {
      // Un rechazo esperado (token vencido, usuario suspendido) es info; uno inesperado (p. ej. Mongo caído) es error.
      const known = toAppError(err)
      if (known) logger.info({ event: 'socket.handshake', status: 'rejected', code: known.code }, 'socket handshake rejected')
      else logger.error({ event: 'socket.handshake', status: 'error', err }, 'socket handshake failed')
      next(handshakeError(err))
    }
  })

  /**
   * Registra un evento con ack. Responde `{ ok: true, ... }` o `{ error: { code, message, requestId, details? } }`.
   * Loguea evento, `requestId`, estado y duración; nunca el texto del mensaje (regla 13).
   */
  function on (socket, event, schema, handler) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const requestId = randomUUID()
      const started = performance.now()
      const { userId } = socket.data
      // Solo se loguea un planId con forma válida: el resto es input del cliente sin validar.
      const log = { event, requestId, userId, planId: objectIdField.safeParse(payload?.planId).data }
      try {
        // El token se verificó al conectar y no se vuelve a mirar (vence con la conexión abierta: límite aceptado),
        // pero un usuario suspendido no puede seguir usando el chat.
        await authService.assertActive(userId)
        const result = await handler(schema.parse(payload ?? {}))
        reply({ ok: true, ...result })
        logger.info({ ...log, status: 'ok', durationMs: Math.round(performance.now() - started) }, 'socket event')
      } catch (err) {
        const known = toAppError(err)
        const error = {
          code: known?.code ?? 'INTERNAL',
          message: known?.message ?? INTERNAL_MESSAGE,
          requestId,
          ...(known?.details ? { details: known.details } : {})
        }
        reply({ error })
        const durationMs = Math.round(performance.now() - started)
        if (known) logger.info({ ...log, status: 'error', code: error.code, durationMs }, 'socket event')
        else logger.error({ ...log, status: 'error', code: error.code, durationMs, err }, 'socket event failed')
        if (CLOSE_CONNECTION_CODES.has(error.code)) socket.disconnect(true)
      }
    })
  }

  io.on('connection', (socket) => {
    const { userId } = socket.data
    // Sala propia: permite sacar al usuario de un chat desde cualquier instancia (broadcaster.removeMember).
    socket.join(userRoom(userId))

    on(socket, 'chat:join', chatRoomPayload, async ({ planId }) => {
      await messageService.requireMember({ planId, userId })
      await socket.join(planRoom(planId))
      // Una baja que terminó entre la verificación y el join ya hizo su `removeMember`: se vuelve a verificar con el
      // socket adentro, así una de las dos operaciones siempre ve a la otra y no queda en la sala sin ser miembro.
      try {
        await messageService.requireMember({ planId, userId })
      } catch (err) {
        await socket.leave(planRoom(planId))
        throw err
      }
      return {}
    })

    on(socket, 'chat:leave', chatRoomPayload, async ({ planId }) => {
      await socket.leave(planRoom(planId))
      return {}
    })

    on(socket, 'chat:send', chatSendPayload, async ({ planId, type, text, audioKey, durationMs, clientId }) => {
      // El servicio guarda y emite `chat:message` a la sala (también cuando el mensaje entra por REST).
      const { created, ...item } = await messageService.send({ planId, userId, type, text, audioKey, durationMs, clientId })
      return { message: await messageSerializer.serialize(item) }
    })
  })

  broadcaster.attach(io)
  return io
}
