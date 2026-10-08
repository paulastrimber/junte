// Adapter de MongoDB. Dueño: Agente B (S1-BE-07).
// Los demás módulos solo dependen de estas firmas. Los índices los crean las migraciones:
// Mongoose corre con autoIndex y autoCreate desactivados (ADR-0002).
import mongoose from 'mongoose'

mongoose.set('autoIndex', false)
mongoose.set('autoCreate', false)

const DEFAULT_PING_TIMEOUT_MS = 2000

/**
 * Conecta Mongoose a MongoDB. Debe apuntar a un replica set (requisito para transacciones).
 * Si ya hay una conexión abierta o en curso, no hace nada.
 * @param {string} uri  Cadena de conexión (MONGO_URI).
 * @param {{ dbName?: string }} [options]  dbName por defecto: MONGO_DB_NAME.
 * @returns {Promise<void>}
 */
export async function connectDb (uri, options = {}) {
  if (!uri) throw new Error('connectDb: falta la cadena de conexión (MONGO_URI)')
  const { readyState } = mongoose.connection
  if (readyState === mongoose.ConnectionStates.connected) return
  if (readyState === mongoose.ConnectionStates.connecting) {
    await mongoose.connection.asPromise()
    return
  }

  await mongoose.connect(uri, {
    dbName: options.dbName ?? process.env.MONGO_DB_NAME,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000
  })
}

/**
 * Cierra la conexión. Idempotente.
 * @returns {Promise<void>}
 */
export async function disconnectDb () {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) return
  await mongoose.disconnect()
}

/**
 * Comprueba que MongoDB responde (comando `ping`). Nunca lanza.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} true si respondió, false si no.
 */
export async function pingDb ({ timeoutMs = DEFAULT_PING_TIMEOUT_MS } = {}) {
  let timer
  try {
    const { db } = mongoose.connection
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs, false) })
    const ping = db.command({ ping: 1 }).then((res) => res?.ok === 1)
    return await Promise.race([ping, timeout])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ejecuta `fn` dentro de una transacción (commit al terminar, abort si lanza).
 * Puede reintentar ante errores transitorios: `fn` no debe tener efectos secundarios fuera de la DB
 * (push, avisos, etc. van después del commit). Toda operación dentro de `fn` debe recibir `{ session }`.
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @returns {Promise<T>} lo que devuelve `fn`.
 */
export async function withTransaction (fn) {
  // connection.transaction usa session.withTransaction (commit/abort/reintentos) y además
  // restaura el estado de los documentos Mongoose si la transacción se aborta.
  return mongoose.connection.transaction((session) => fn(session))
}

/**
 * Conexión de Mongoose. Para migraciones, tests y scripts; los módulos usan modelos/repositorios.
 * @returns {import('mongoose').Connection}
 */
export function getConnection () {
  return mongoose.connection
}
