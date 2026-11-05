// Dispositivos para avisos push (S5-MOB-03). La identidad sale del token: la app nunca manda un userId.
import { getApiClient } from './client.js'

/**
 * Registra (o reasigna a esta cuenta) el token nativo de push del teléfono.
 * @param {{ token: string, platform: 'android' | 'ios' }} params
 */
export async function registerDevice ({ token, platform }, { client = getApiClient() } = {}) {
  await client.post('/devices', { token, platform })
}

/** Da de baja el token (al cerrar sesión). Idempotente. */
export async function unregisterDevice (token, { client = getApiClient() } = {}) {
  await client.delete(`/devices/${encodeURIComponent(token)}`)
}
