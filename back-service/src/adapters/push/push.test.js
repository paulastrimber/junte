import { generateKeyPairSync } from 'node:crypto'
import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { createFcmPush, createMemoryPush, createNoopPush, createPushFromConfig } from './index.js'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
const serviceAccount = { projectId: 'junte-dev', clientEmail: 'push@junte-dev.iam.gserviceaccount.com', privateKey }
const message = { tokens: ['tok-ok', 'tok-gone', 'tok-bad', 'tok-bad-msg', 'tok-payload', 'tok-project', 'tok-500'], notification: { title: 'Hola', body: 'Chau' }, data: { type: 'x', planId: 'p' } }

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFcm () {
  const calls = []
  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, init })
    if (url === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'ya29.token', expires_in: 3600 })
    const { message: { token } } = JSON.parse(init.body)
    if (token === 'tok-ok') return json(200, { name: 'projects/junte-dev/messages/1' })
    if (token === 'tok-gone') return json(404, { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } })
    // Token mal formado: el detalle señala el campo message.token.
    if (token === 'tok-bad') return json(400, { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token', description: 'Invalid registration token' }] }] } })
    if (token === 'tok-bad-msg') return json(400, { error: { code: 400, message: 'The registration token is not a valid FCM registration token', status: 'INVALID_ARGUMENT' } })
    // Payload inválido: no es culpa del token, no se borra.
    if (token === 'tok-payload') return json(400, { error: { code: 400, message: 'Invalid value at message.data', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.data', description: 'Invalid value' }] }] } })
    // 404 sin UNREGISTERED (p. ej. proyecto inexistente): tampoco se borra.
    if (token === 'tok-project') return json(404, { error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' } })
    return json(500, { error: { status: 'INTERNAL' } })
  })
  return { fetch, calls }
}

describe('createFcmPush', () => {
  it('envía un mensaje por token con el access token de OAuth y separa los tokens inválidos', async () => {
    const { fetch, calls } = fakeFcm()
    const logger = { warn: vi.fn() }
    const push = createFcmPush({ serviceAccount, logger, fetch })

    const result = await push.send(message)

    expect(result).toEqual({ sent: 1, failed: 3, invalidTokens: ['tok-gone', 'tok-bad', 'tok-bad-msg'] })
    const [oauth, ...sends] = calls
    const assertion = decodeJwt(new URLSearchParams(oauth.init.body).get('assertion'))
    expect(assertion).toMatchObject({ iss: serviceAccount.clientEmail, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    expect(sends[0].url).toBe('https://fcm.googleapis.com/v1/projects/junte-dev/messages:send')
    expect(sends[0].init.headers.authorization).toBe('Bearer ya29.token')
    expect(JSON.parse(sends[0].init.body).message).toMatchObject({ token: 'tok-ok', notification: message.notification, data: message.data })
    // Nunca el token del dispositivo en los logs.
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/tok-/)
  })

  it('reutiliza el access token hasta poco antes de que venza', async () => {
    const { fetch, calls } = fakeFcm()
    let clock = 0
    const push = createFcmPush({ serviceAccount, logger: { warn: vi.fn() }, fetch, now: () => clock })

    await push.send({ ...message, tokens: ['tok-ok'] })
    await push.send({ ...message, tokens: ['tok-ok'] })
    clock = 3600 * 1000
    await push.send({ ...message, tokens: ['tok-ok'] })

    expect(calls.filter(({ url }) => url.includes('oauth2')).length).toBe(2)
  })

  it('si no consigue el access token no lanza: cuenta todo como fallido', async () => {
    const fetch = vi.fn(async () => json(401, { error: 'invalid_grant' }))
    const push = createFcmPush({ serviceAccount, logger: { warn: vi.fn() }, fetch })

    expect(await push.send(message)).toEqual({ sent: 0, failed: 7, invalidTokens: [] })
  })
})

describe('createMemoryPush', () => {
  it('guarda lo enviado e informa los tokens marcados como inválidos', async () => {
    const push = createMemoryPush({ invalidTokens: ['tok-gone'] })

    expect(await push.send({ ...message, tokens: ['tok-ok', 'tok-gone'] })).toEqual({ sent: 1, failed: 0, invalidTokens: ['tok-gone'] })
    expect(push.sent).toEqual([{ ...message, tokens: ['tok-ok'] }])
  })
})

describe('createPushFromConfig y createNoopPush', () => {
  const logger = { info: vi.fn(), warn: vi.fn() }

  it('en producción sin credencial usa el no-op: no acumula nada y no loguea tokens', async () => {
    const push = createPushFromConfig({ config: { env: 'production', push: null }, logger })

    expect(push.sent).toBeUndefined()
    expect(await push.send(message)).toEqual({ sent: 0, failed: 0, invalidTokens: [] })
    expect(Object.keys(push)).toEqual(['send'])
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/tok-/)
  })

  it('en tests sin credencial usa el de memoria, y con credencial usa FCM', async () => {
    expect(createPushFromConfig({ config: { env: 'test', push: null }, logger }).sent).toEqual([])
    const fcm = createPushFromConfig({ config: { env: 'production', push: { fcm: serviceAccount } }, logger })
    expect(fcm.sent).toBeUndefined()
    expect(createNoopPush({ logger })).not.toBe(fcm)
  })
})
