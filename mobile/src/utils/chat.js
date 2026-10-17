// Funciones puras del chat: ids de idempotencia, fusión de mensajes y formato de la hora.
import { isSameSignedFile } from './url.js'

/** Estado de un mensaje en la app. Los que vienen del servidor siempre están `sent`. */
export const MESSAGE_STATUS = Object.freeze({ SENT: 'sent', PENDING: 'pending', FAILED: 'failed' })

/** Largo máximo de un mensaje (el servidor valida lo mismo, después de recortar los espacios). */
export const MAX_MESSAGE_LENGTH = 2000

const pad = (value) => String(value).padStart(2, '0')

/**
 * Id que genera el teléfono para que reintentar un envío no duplique el mensaje. Es una clave de idempotencia,
 * no un secreto: no hace falta que sea criptográficamente aleatorio. Cumple `^[A-Za-z0-9_-]{1,64}$`.
 * @param {() => number} [now]
 * @param {() => number} [random]
 */
export function createClientId (now = Date.now, random = Math.random) {
  return `${now().toString(36)}-${random().toString(36).slice(2, 10)}`
}

/** Los que todavía no confirmó el servidor (pendientes y fallidos) van siempre arriba, como lo más nuevo. */
const isUnsent = (message) => message.status !== MESSAGE_STATUS.SENT

/**
 * Ordena del más nuevo al más viejo (lo que espera una lista invertida). Los ids de Mongo crecen con el tiempo,
 * así que desempatan mensajes con el mismo instante.
 * @param {object[]} messages
 */
export function sortMessages (messages) {
  return [...messages].sort((a, b) => {
    if (isUnsent(a) !== isUnsent(b)) return isUnsent(a) ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  })
}

// Quien escribió es el mismo si solo cambió la firma de la URL de su foto (el back la firma de nuevo en cada respuesta).
function isSameSender (a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.id === b.id && a.name === b.name && a.reputation === b.reputation && isSameSignedFile(a.photoUrl, b.photoUrl)
}

// Un mensaje que volvió a llegar sin cambios (por el polling o al reconectar) conserva el objeto que ya estaba: así
// la fila memoizada no se vuelve a pintar y el avatar no se vuelve a descargar por una URL firmada nueva.
function isSameServerMessage (saved, incoming) {
  if (saved.status !== MESSAGE_STATUS.SENT) return false
  return Object.keys(incoming).every((key) => (key === 'sender'
    ? isSameSender(saved.sender, incoming.sender)
    : key === 'status' || Object.is(saved[key], incoming[key])))
}

/**
 * Suma mensajes del servidor a la lista, sin duplicar: uno con el mismo `id` reemplaza al que ya estaba, y uno con
 * el `clientId` de un envío propio sin confirmar (pendiente o fallido) lo reemplaza. Lo que llega igual a lo que ya
 * había no se toca y, si no cambió nada, devuelve la misma lista (`current`).
 * @param {object[]} current  Ordenada como la devuelve esta función.
 * @param {object[]} incoming  Mensajes tal como los devuelve el servidor.
 * @returns {object[]} lista del más nuevo al más viejo.
 */
export function mergeMessages (current, incoming) {
  const merged = [...current]
  let hasChanges = false
  for (const message of incoming) {
    let index = merged.findIndex((item) => item.id === message.id)
    if (index === -1 && message.clientId) {
      index = merged.findIndex((item) => isUnsent(item) && item.clientId === message.clientId)
    }
    const previous = index === -1 ? null : merged[index]
    if (previous && isSameServerMessage(previous, message)) continue
    // Si solo cambió la firma de la foto se conserva el `sender` anterior (misma imagen, misma URL para `Image`).
    const sender = previous && isSameSender(previous.sender, message.sender) ? previous.sender : message.sender
    const saved = { ...message, sender, status: MESSAGE_STATUS.SENT }
    if (index === -1) merged.push(saved)
    else merged[index] = saved
    hasChanges = true
  }
  return hasChanges ? sortMessages(merged) : current
}

/**
 * Fusiona la primera página (los mensajes más nuevos) pedida otra vez, después de reconectar o por polling.
 * Si no hay ningún mensaje en común con lo que ya había y todavía quedan más viejos, entre una cosa y la otra
 * pudo haber un hueco: se descarta lo anterior y se queda con la página (más lo que no se confirmó).
 * @param {object[]} current
 * @param {{ items: object[], nextCursor: string | null }} page
 * @returns {{ messages: object[], isReplaced: boolean }}  `isReplaced`: el cursor para ir hacia atrás es el de la página.
 */
export function mergeRecoveredPage (current, page) {
  const known = new Set(current.filter((message) => !isUnsent(message)).map((message) => message.id))
  const overlaps = page.items.some((message) => known.has(message.id))
  const isReplaced = known.size === 0 || (!overlaps && page.nextCursor !== null)
  const base = isReplaced ? current.filter(isUnsent) : current
  return { messages: mergeMessages(base, page.items), isReplaced }
}

/**
 * Hora de un mensaje: "14:05" si es de hoy; con el día ("12/10 14:05") si es anterior.
 * @param {string} iso  ISO 8601
 * @param {Date} [now]
 */
export function formatMessageTime (iso, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return isToday ? time : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`
}
