// Mensajes del chat de un plan. La identidad sale del token: la app nunca manda un senderId.
import { getApiClient } from './client.js'

const planPath = (id) => `/plans/${encodeURIComponent(id)}`

/**
 * Mensajes de un plan, del más nuevo al más viejo (solo para participantes activos y el creador).
 * @param {string} id
 * @param {{ limit?: number, cursor?: string }} [params]
 * @returns {Promise<{ items: Message[], nextCursor: string | null }>}
 *
 * @typedef {object} Message
 * @property {string} id
 * @property {string} planId
 * @property {{ id: string, name: string | null, photoUrl: string | null, reputation: number } | null} sender
 * @property {string} type  'text' (las notas de voz, 'voice', llegarán más adelante)
 * @property {string} text
 * @property {string | null} clientId
 * @property {string} createdAt  ISO 8601
 */
export async function listMessages (id, { limit, cursor } = {}, { client = getApiClient(), signal } = {}) {
  const params = Object.fromEntries(Object.entries({ limit, cursor }).filter(([, value]) => value !== undefined && value !== null))
  const { data } = await client.get(`${planPath(id)}/messages`, { params, signal })
  return data
}

/**
 * Envía un mensaje (respaldo del socket). Idempotente por `clientId`: repetir el mismo devuelve el mensaje ya
 * guardado (200) en lugar de duplicarlo (201 la primera vez).
 * @param {string} id
 * @param {{ text: string, clientId?: string }} body
 * @returns {Promise<Message>}
 */
export async function sendMessage (id, { text, clientId }, { client = getApiClient() } = {}) {
  const { data } = await client.post(`${planPath(id)}/messages`, { text, ...(clientId ? { clientId } : {}) })
  return data
}
