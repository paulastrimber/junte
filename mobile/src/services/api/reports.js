// Reportes (S6-MOB-03). La identidad sale del token: la app nunca manda un reporterId. Un reporte nunca se ve desde la
// app: solo lo revisa el equipo de moderación en el panel.
import { getApiClient } from './client.js'

/** Motivos que acepta el back (POST /reports). El texto de cada uno está en la pantalla de reporte. */
export const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'inappropriate', 'scam', 'other'])

/** Largo máximo de la descripción (el back valida lo mismo, después de recortar los espacios). */
export const REPORT_DESCRIPTION_MAX_LENGTH = 500

/**
 * @param {{ targetType: 'user' | 'plan' | 'message', targetId: string, reason: string, description?: string }} report
 * @returns {Promise<{ id: string, status: 'pending', isDuplicate: boolean }>}
 *   `isDuplicate`: ya había un reporte pendiente de esta persona sobre lo mismo (el servidor no creó otro).
 */
export async function createReport ({ targetType, targetId, reason, description }, { client = getApiClient() } = {}) {
  const response = await client.post('/reports', { targetType, targetId, reason, ...(description ? { description } : {}) })
  return { ...response.data, isDuplicate: response.status === 200 }
}
