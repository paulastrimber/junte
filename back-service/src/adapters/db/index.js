// Contrato del adapter de MongoDB. Dueño: Agente B (S1-BE-07).
// Los demás módulos solo dependen de estas firmas; la implementación llega en S1-BE-07.

/**
 * Conecta Mongoose a MongoDB. Debe apuntar a un replica set (requisito para transacciones).
 * @param {string} uri  Cadena de conexión (MONGO_URI).
 * @param {{ dbName?: string }} [options]  dbName por defecto: MONGO_DB_NAME.
 * @returns {Promise<void>}
 */
export async function connectDb (uri, options = {}) {
  throw new Error('Not implemented: connectDb (S1-BE-07)')
}

/**
 * Cierra la conexión. Idempotente.
 * @returns {Promise<void>}
 */
export async function disconnectDb () {
  throw new Error('Not implemented: disconnectDb (S1-BE-07)')
}

/**
 * Comprueba que MongoDB responde (comando `ping`). Nunca lanza.
 * @returns {Promise<boolean>} true si respondió, false si no.
 */
export async function pingDb () {
  throw new Error('Not implemented: pingDb (S1-BE-07)')
}

/**
 * Ejecuta `fn` dentro de una transacción (commit al terminar, abort si lanza).
 * Puede reintentar ante errores transitorios: `fn` no debe tener efectos secundarios fuera de la DB.
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @returns {Promise<T>} lo que devuelve `fn`.
 */
export async function withTransaction (fn) {
  throw new Error('Not implemented: withTransaction (S1-BE-07)')
}
