// Inscripciones de un plan. La identidad sale del token: la app nunca manda un userId.
import { getApiClient } from './client.js'

const planPath = (id) => `/plans/${encodeURIComponent(id)}`

/** @returns {Promise<{ planId: string, status: 'active', joinedAt: string }>} la inscripción */
export async function joinPlan (id, { client = getApiClient() } = {}) {
  const { data } = await client.post(`${planPath(id)}/join`)
  return data
}

/** Baja. Idempotente: también responde bien si no estaba inscripto. */
export async function leavePlan (id, { client = getApiClient() } = {}) {
  await client.delete(`${planPath(id)}/join`)
}

/** Pide que le avisen cuando se libere un lugar en un plan lleno. Idempotente. */
export async function requestSpotAlert (id, { client = getApiClient() } = {}) {
  await client.put(`${planPath(id)}/spot-alert`)
}

/** Cancela el aviso de lugar libre. Idempotente. */
export async function cancelSpotAlert (id, { client = getApiClient() } = {}) {
  await client.delete(`${planPath(id)}/spot-alert`)
}

/**
 * Anotados de un plan (solo para participantes y el creador).
 * @param {string} id
 * @param {{ limit?: number, cursor?: string }} [params]
 * @returns {Promise<{ items: Array<{ id: string, name: string | null, photoUrl: string | null, reputation: number }>, nextCursor: string | null }>}
 */
export async function listParticipants (id, { limit, cursor } = {}, { client = getApiClient(), signal } = {}) {
  const params = Object.fromEntries(Object.entries({ limit, cursor }).filter(([, value]) => value !== undefined && value !== null))
  const { data } = await client.get(`${planPath(id)}/participants`, { params, signal })
  return data
}
