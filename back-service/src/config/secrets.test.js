import { describe, expect, it, vi } from 'vitest'
import { ConfigError } from './env.js'
import { resolveSecrets } from './secrets.js'

const JWT = 'j'.repeat(64)
const URI = 'mongodb://junte_app:s3cr3tPassw0rd@10.0.30.10:27017/?replicaSet=rs0'

const AWS_ENV = Object.freeze({
  NODE_ENV: 'production',
  AWS_REGION: 'us-east-1',
  JWT_SECRET_ID: 'junte/dev/jwt-secret',
  MONGO_URI_SECRET_ID: 'junte/dev/mongo-app-uri'
})

/** Cliente falso: `values` por nombre de secreto; un Error como valor simula el error del SDK. */
function fakeSecrets (values) {
  const getSecretString = vi.fn(async (secretId) => {
    const value = values[secretId]
    if (value instanceof Error) throw value
    if (value === undefined) throw Object.assign(new Error(`Secrets Manager can't find ${secretId}`), { name: 'ResourceNotFoundException' })
    return value
  })
  const createClient = vi.fn(async () => ({ getSecretString }))
  return { createClient, getSecretString }
}

async function errorOf (promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('resolveSecrets debía lanzar')
}

describe('resolveSecrets', () => {
  it('sin *_SECRET_ID devuelve el mismo entorno y no crea el cliente (local, tests)', async () => {
    const env = { NODE_ENV: 'development', JWT_SECRET: JWT, MONGO_URI: 'mongodb://localhost:27017' }
    const { createClient } = fakeSecrets({})

    await expect(resolveSecrets(env, { createClient })).resolves.toBe(env)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('completa JWT_SECRET y MONGO_URI desde Secrets Manager, con la región de AWS_REGION', async () => {
    const { createClient, getSecretString } = fakeSecrets({ 'junte/dev/jwt-secret': JWT, 'junte/dev/mongo-app-uri': URI })

    const resolved = await resolveSecrets(AWS_ENV, { createClient })

    expect(resolved).toMatchObject({ ...AWS_ENV, JWT_SECRET: JWT, MONGO_URI: URI })
    expect(createClient).toHaveBeenCalledWith({ region: 'us-east-1' })
    expect(getSecretString).toHaveBeenCalledTimes(2)
  })

  it('no modifica el entorno que recibe', async () => {
    const env = { ...AWS_ENV }
    const { createClient } = fakeSecrets({ 'junte/dev/jwt-secret': JWT, 'junte/dev/mongo-app-uri': URI })

    await resolveSecrets(env, { createClient })

    expect(env).toEqual(AWS_ENV)
  })

  it('resuelve solo las referencias presentes', async () => {
    const env = { NODE_ENV: 'production', AWS_REGION: 'us-east-1', JWT_SECRET_ID: 'junte/dev/jwt-secret', MONGO_URI: 'mongodb://x' }
    const { createClient, getSecretString } = fakeSecrets({ 'junte/dev/jwt-secret': JWT })

    const resolved = await resolveSecrets(env, { createClient })

    expect(resolved).toMatchObject({ JWT_SECRET: JWT, MONGO_URI: 'mongodb://x' })
    expect(getSecretString).toHaveBeenCalledTimes(1)
  })

  it('completa RESEND_API_KEY desde Secrets Manager (emails de recuperación de contraseña)', async () => {
    const env = { ...AWS_ENV, RESEND_API_KEY_SECRET_ID: 'junte/dev/resend-api-key', MAIL_FROM: 'junte <no-reply@junteapp.me>' }
    const { createClient } = fakeSecrets({ 'junte/dev/jwt-secret': JWT, 'junte/dev/mongo-app-uri': URI, 'junte/dev/resend-api-key': 're_clave_de_prueba_123' })

    const resolved = await resolveSecrets(env, { createClient })

    expect(resolved).toMatchObject({ RESEND_API_KEY: 're_clave_de_prueba_123', MAIL_FROM: env.MAIL_FROM })
  })

  it('sin AWS_REGION no arranca, y no llega a crear el cliente', async () => {
    const { createClient } = fakeSecrets({})
    const { AWS_REGION, ...env } = AWS_ENV

    const err = await errorOf(resolveSecrets(env, { createClient }))

    expect(err).toBeInstanceOf(ConfigError)
    expect(err.variables).toEqual(['AWS_REGION'])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('el valor y su referencia juntos es un error (no se sabe cuál vale)', async () => {
    const { createClient } = fakeSecrets({})

    const err = await errorOf(resolveSecrets({ ...AWS_ENV, JWT_SECRET: JWT }, { createClient }))

    expect(err).toBeInstanceOf(ConfigError)
    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).not.toContain(JWT)
  })

  it('si un secreto no se puede leer no arranca: nombra la variable, el secreto y el tipo de error', async () => {
    const denied = Object.assign(new Error(`User is not authorized; value ${URI}`), { name: 'AccessDeniedException' })
    const { createClient } = fakeSecrets({ 'junte/dev/jwt-secret': JWT, 'junte/dev/mongo-app-uri': denied })

    const err = await errorOf(resolveSecrets(AWS_ENV, { createClient }))

    expect(err).toBeInstanceOf(ConfigError)
    expect(err.variables).toEqual(['MONGO_URI_SECRET_ID'])
    expect(err.message).toContain('junte/dev/mongo-app-uri')
    expect(err.message).toContain('AccessDeniedException')
  })

  it('informa todos los secretos que fallan juntos', async () => {
    const { createClient } = fakeSecrets({})

    const err = await errorOf(resolveSecrets(AWS_ENV, { createClient }))

    expect(err.variables).toEqual(['JWT_SECRET_ID', 'MONGO_URI_SECRET_ID'])
    expect(err.message).toContain('ResourceNotFoundException')
  })

  it('un secreto vacío o binario (sin SecretString) es un error', async () => {
    const { createClient } = fakeSecrets({ 'junte/dev/jwt-secret': '', 'junte/dev/mongo-app-uri': URI })

    const err = await errorOf(resolveSecrets(AWS_ENV, { createClient }))

    expect(err.variables).toEqual(['JWT_SECRET_ID'])
  })

  it('ningún mensaje de error incluye valores de secretos ni el mensaje del SDK', async () => {
    const leaky = Object.assign(new Error(`boom ${URI} ${JWT}`), { name: 'InternalServiceError' })
    const { createClient } = fakeSecrets({ 'junte/dev/jwt-secret': leaky, 'junte/dev/mongo-app-uri': leaky })

    const err = await errorOf(resolveSecrets(AWS_ENV, { createClient }))

    expect(err.message).not.toContain(URI)
    expect(err.message).not.toContain(JWT)
    expect(err.message).not.toContain('boom')
  })
})
