import { getApiClient } from './client.js'

/**
 * Pide una URL firmada para subir una imagen directo a S3.
 * @param {{ contentType: string, sizeBytes: number }} params
 * @returns {Promise<{ url: string, objectKey: string, expiresAt: string }>}
 */
export async function presign ({ contentType, sizeBytes }, { client = getApiClient() } = {}) {
  const { data } = await client.post('/uploads/presign', { contentType, sizeBytes })
  return data
}
