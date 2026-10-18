// QR de asistencia y check-in. La ubicación viaja solo en el check-in y no se guarda en el teléfono.
import { getApiClient } from './client.js'

const planPath = (id) => `/plans/${encodeURIComponent(id)}`

/**
 * Pide un QR nuevo (solo el creador, dentro del horario de asistencia). Invalida el anterior.
 * `serverDate` es el header HTTP `Date` de la respuesta (la hora del servidor): con eso se calcula cuánto le queda
 * al QR sin depender del reloj del teléfono. `null` si no vino.
 * @returns {Promise<{ qrToken: string, expiresAt: string, serverDate: string | null }>}
 */
export async function createPlanQr (id, { client = getApiClient(), signal } = {}) {
  const { data, headers } = await client.post(`${planPath(id)}/qr`, undefined, { signal })
  return { ...data, serverDate: headers?.date ?? null }
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
