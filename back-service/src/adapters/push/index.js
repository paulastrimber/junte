// Envío de notificaciones push (S5-BE-07). Dos implementaciones con la misma interfaz:
// - fcm.js: Firebase Cloud Messaging (API HTTP v1), con la cuenta de servicio de FCM_SERVICE_ACCOUNT.
// - memory.js: sin credenciales (local, tests): no envía nada, guarda lo que habría mandado.
export { createFcmPush } from './fcm.js'
export { createMemoryPush } from './memory.js'

/**
 * @typedef {object} PushMessage
 * @property {string[]} tokens  Tokens nativos de FCM de los dispositivos destino.
 * @property {{ title: string, body: string }} notification  Sin datos sensibles (ni ubicación ni texto del chat).
 * @property {Record<string, string>} data  Para la app (p. ej. `{ type, planId }`): abre el plan al tocar el aviso.
 */

/**
 * @typedef {object} PushResult
 * @property {number} sent
 * @property {number} failed  Fallos que no son del token (se loguean y no se reintentan).
 * @property {string[]} invalidTokens  Tokens que FCM informó como inválidos o dados de baja: hay que borrarlos.
 */

/**
 * @typedef {object} Push
 * @property {(message: PushMessage) => Promise<PushResult>} send  Nunca lanza por un token: lo cuenta en el resultado.
 */
