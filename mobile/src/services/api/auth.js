// Un endpoint de /auth por función. register, login, refresh y los dos de recuperación de contraseña son públicos:
// `skipAuth` evita mandar el access token y que un 401 (credenciales incorrectas, refresh inválido, código
// incorrecto) dispare otro refresh.
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

/**
 * Pide el código para elegir una contraseña nueva. Responde igual exista o no una cuenta con ese email.
 * @param {{ email: string }} params
 */
export async function forgotPassword ({ email }, { client = getApiClient() } = {}) {
  await client.post('/auth/forgot-password', { email }, { skipAuth: true })
}

/**
 * Cambia la contraseña con el código que llegó por email. Cierra todas las sesiones de la cuenta.
 * @param {{ email: string, code: string, newPassword: string }} params
 */
export async function resetPassword ({ email, code, newPassword }, { client = getApiClient() } = {}) {
  await client.post('/auth/reset-password', { email, code, newPassword }, { skipAuth: true })
}

/**
 * Cambia la contraseña con la sesión iniciada. Las demás sesiones se cierran; esta sigue abierta.
 * @param {{ currentPassword: string, newPassword: string }} params
 */
export async function changePassword ({ currentPassword, newPassword }, { client = getApiClient() } = {}) {
  await client.post('/auth/change-password', { currentPassword, newPassword })
}
