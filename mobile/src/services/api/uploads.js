import { getApiClient } from './client.js'

/**
 * Pide una URL firmada para subir un archivo directo a S3: una imagen (foto de perfil o, con `planId`, del plan) o una
 * nota de voz (`audio/mp4`, con el `planId` del chat).
 * @param {{ contentType: string, sizeBytes: number, planId?: string }} params
 * @returns {Promise<{ url: string, objectKey: string, expiresAt: string }>}
 */
export async function presign ({ contentType, sizeBytes, planId }, { client = getApiClient() } = {}) {
  const { data } = await client.post('/uploads/presign', { contentType, sizeBytes, ...(planId ? { planId } : {}) })
  return data
}
