// Firebase Cloud Messaging, API HTTP v1 (https://firebase.google.com/docs/cloud-messaging/send/v1-api).
// Sin firebase-admin: la cuenta de servicio firma un JWT (RS256, con `jose`) que se canjea por un access token de
// OAuth 2.0 (se cachea hasta poco antes de vencer), y cada token se envía con un POST a messages:send.
// Errores por token: UNREGISTERED (404) o INVALID_ARGUMENT (400) → el token se informa como inválido para borrarlo.
// Nunca se loguea un token ni la clave privada.
import { SignJWT, importPKCS8 } from 'jose'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const ASSERTION_TTL_SECONDS = 3600
// Se renueva un minuto antes de que venza.
const REFRESH_MARGIN_MS = 60_000
const REQUEST_TIMEOUT_MS = 5000
const DEFAULT_CONCURRENCY = 10
const INVALID_TOKEN_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT'])

/**
 * @param {object} params
 * @param {{ projectId: string, clientEmail: string, privateKey: string }} params.serviceAccount
 * @param {{ warn: (obj: object, msg: string) => void }} params.logger
 * @param {typeof fetch} [params.fetch]
 * @param {() => number} [params.now]  Milisegundos (Date.now): solo para el caché del access token.
 * @param {number} [params.concurrency]
 * @returns {import('./index.js').Push}
 */
export function createFcmPush ({ serviceAccount, logger, fetch = globalThis.fetch, now = Date.now, concurrency = DEFAULT_CONCURRENCY }) {
  const { projectId, clientEmail, privateKey } = serviceAccount
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`
  let signingKey = null
  let cached = null

  async function fetchAccessToken () {
    signingKey ??= await importPKCS8(privateKey, 'RS256')
    const issuedAt = Math.floor(now() / 1000)
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ASSERTION_TTL_SECONDS)
      .sign(signingKey)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`FCM OAuth token request failed with HTTP ${res.status}`)
    const body = await res.json()
    return { value: body.access_token, expiresAt: now() + Number(body.expires_in ?? 3600) * 1000 }
  }

  async function accessToken () {
    if (!cached || cached.expiresAt - REFRESH_MARGIN_MS <= now()) cached = await fetchAccessToken()
    return cached.value
  }

  /** @returns {Promise<'sent' | 'invalid' | 'failed'>} */
  async function sendOne (token, { notification, data }, bearer) {
    let res
    try {
      res = await fetch(sendUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token, notification, data, android: { priority: 'high' } } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (err) {
      logger.warn({ reason: err?.name ?? 'Error' }, 'fcm send failed')
      return 'failed'
    }
    if (res.ok) return 'sent'
    const errorCode = await readErrorCode(res)
    if (res.status === 404 || INVALID_TOKEN_CODES.has(errorCode)) return 'invalid'
    // Si el access token venció antes de lo previsto, el próximo envío pide otro.
    if (res.status === 401) cached = null
    logger.warn({ status: res.status, errorCode }, 'fcm send failed')
    return 'failed'
  }

  return {
    async send (message) {
      const result = { sent: 0, failed: 0, invalidTokens: [] }
      if (message.tokens.length === 0) return result
      let bearer
      try {
        bearer = await accessToken()
      } catch (err) {
        logger.warn({ reason: err?.message }, 'fcm unavailable: could not get an access token')
        return { ...result, failed: message.tokens.length }
      }
      // De a `concurrency` envíos a la vez.
      for (let start = 0; start < message.tokens.length; start += concurrency) {
        const batch = message.tokens.slice(start, start + concurrency)
        const outcomes = await Promise.all(batch.map((token) => sendOne(token, message, bearer)))
        outcomes.forEach((outcome, index) => {
          if (outcome === 'sent') result.sent += 1
          else if (outcome === 'invalid') result.invalidTokens.push(batch[index])
          else result.failed += 1
        })
      }
      return result
    }
  }
}

/** `error.status` (p. ej. INVALID_ARGUMENT) o el `errorCode` de FCM en `details` (p. ej. UNREGISTERED). */
async function readErrorCode (res) {
  try {
    const body = await res.json()
    const fcmCode = body?.error?.details?.find((detail) => typeof detail?.errorCode === 'string')?.errorCode
    return fcmCode ?? body?.error?.status ?? null
  } catch {
    return null
  }
}
