// Arranque: config validada → conexiones → app → listen; apagado ordenado con SIGTERM/SIGINT.
// Importar ./config/index.js termina el proceso si falta alguna variable de entorno.
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { config } from './config/index.js'
import { createContainer } from './container.js'

// Si las requests en curso no terminan en este tiempo, se corta igual (el ALB ya dejó de mandar tráfico).
const SHUTDOWN_TIMEOUT_MS = 10_000
// Los ALB cierran conexiones ociosas a los 300 s; Node tiene que mantenerlas abiertas más que el ALB
// para no cortar una conexión que el ALB todavía considera viva (eso produce 502 intermitentes).
const KEEP_ALIVE_TIMEOUT_MS = 305_000
const HEADERS_TIMEOUT_MS = KEEP_ALIVE_TIMEOUT_MS + 1000

const container = createContainer(config)
const { logger } = container

function listen (server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function registerShutdown (server) {
  let isShuttingDown = false

  async function shutdown (signal) {
    if (isShuttingDown) return
    isShuttingDown = true
    logger.info({ signal }, 'shutting down')

    const forceExit = setTimeout(() => {
      logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExit.unref()

    // Corta los WebSocket (la app reconecta contra otra instancia) y deja de aceptar conexiones HTTP.
    await container.closeSockets()
    // Espera las requests en curso (Node ≥ 19 cierra las keep-alive ociosas). Si Socket.io ya lo cerró, no hace nada.
    await new Promise((resolve) => server.close(() => resolve()))
    // Espera al ciclo de jobs en curso antes de cerrar las conexiones que usa.
    await container.scheduler.stop()
    await container.disconnect()
    clearTimeout(forceExit)
    logger.info('shutdown complete')
    process.exit(0)
  }

  process.once('SIGTERM', () => { shutdown('SIGTERM').catch(onFatal) })
  process.once('SIGINT', () => { shutdown('SIGINT').catch(onFatal) })
}

function onFatal (err) {
  logger.fatal({ err }, 'fatal error')
  process.exit(1)
}

async function start () {
  try {
    await container.connect()
  } catch (err) {
    logger.fatal({ err }, 'could not connect to dependencies, not starting')
    await container.disconnect()
    process.exit(1)
  }

  const server = createServer(createApp(container.appDeps))
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
  server.headersTimeout = HEADERS_TIMEOUT_MS
  // Chat en tiempo real: Socket.io en /internal/socket.io con el adaptador de Redis (S5-BE-04).
  await container.attachSockets(server)

  registerShutdown(server)
  await listen(server, config.port)
  logger.info({ port: config.port, env: config.env }, 'back-service listening')
  container.scheduler.start()
}

start().catch(onFatal)
