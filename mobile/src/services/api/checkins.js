// QR de asistencia y check-in. La ubicación viaja solo en el check-in y no se guarda en el teléfono.
import { getApiClient } from './client.js'

const planPath = (id) => `/plans/${encodeURIComponent(id)}`

/**
 * Pide un QR nuevo (solo el creador, dentro del horario de asistencia). Invalida el anterior.
 * @returns {Promise<{ qrToken: string, expiresAt: string }>}
 */
export async function createPlanQr (id, { client = getApiClient(), signal } = {}) {
  const { data } = await client.post(`${planPath(id)}/qr`, undefined, { signal })
  return data
}

/**
 * Registra la asistencia. `qrToken` es lo que se leyó del QR (el creador inscripto no lo manda).
 * @param {string} id
 * @param {{ qrToken?: string, latitude: number, longitude: number, accuracyMeters: number }} body
 * @returns {Promise<{ planId: string, checkedInAt: string, method: string, distanceMeters: number }>}
 */
export async function checkIn (id, body, { client = getApiClient() } = {}) {
  const { data } = await client.post(`${planPath(id)}/check-in`, body)
  return data
}
