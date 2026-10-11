// /users/me. La identidad sale del token: la app nunca manda un userId.
import { getApiClient } from './client.js'

/** @returns {Promise<object>} perfil propio */
export async function getMe ({ client = getApiClient() } = {}) {
  const { data } = await client.get('/users/me')
  return data
}

/**
 * @param {{ name?: string, birthDate?: string, university?: string, neighborhood?: string, city?: string, interests?: string[] }} changes
 * @returns {Promise<object>} perfil actualizado
 */
export async function updateMe (changes, { client = getApiClient() } = {}) {
  const { data } = await client.put('/users/me', changes)
  return data
}

/**
 * Vincula la foto ya subida a S3.
 * @param {{ objectKey: string }} params
 * @returns {Promise<object>} perfil actualizado (con photoUrl)
 */
export async function setPhoto ({ objectKey }, { client = getApiClient() } = {}) {
  const { data } = await client.put('/users/me/photo', { objectKey })
  return data
}
