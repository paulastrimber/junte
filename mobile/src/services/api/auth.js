// Un endpoint de /auth por función. register, login y refresh son públicos: `skipAuth` evita mandar el
// access token y que un 401 (credenciales incorrectas, refresh inválido) dispare otro refresh.
import { getApiClient } from './client.js'

/**
 * @typedef {{ user: object, accessToken: string, refreshToken: string }} SessionResponse
 */

/** @returns {Promise<SessionResponse>} */
export async function register ({ name, email, password, deviceLabel }, { client = getApiClient() } = {}) {
  const { data } = await client.post('/auth/register', { name, email, password, deviceLabel }, { skipAuth: true })
  return data
}

/** @returns {Promise<SessionResponse>} */
export async function login ({ email, password, deviceLabel }, { client = getApiClient() } = {}) {
  const { data } = await client.post('/auth/login', { email, password, deviceLabel }, { skipAuth: true })
  return data
}

/** @returns {Promise<{ accessToken: string, refreshToken: string }>} */
export async function refresh ({ refreshToken }, { client = getApiClient() } = {}) {
  const { data } = await client.post('/auth/refresh', { refreshToken }, { skipAuth: true })
  return data
}

/** Cierra la sesión del access token con el que se llama. */
export async function logout ({ client = getApiClient() } = {}) {
  await client.post('/auth/logout')
}

/** Cierra todas las sesiones del usuario (todos sus dispositivos). */
export async function logoutAll ({ client = getApiClient() } = {}) {
  await client.post('/auth/logout-all')
}
