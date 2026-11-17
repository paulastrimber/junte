import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './env.js'

const SECRET = 'x'.repeat(32)

const validEnv = Object.freeze({
  NODE_ENV: 'development',
  PORT: '3000',
  MONGO_URI: 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGO_DB_NAME: 'junte',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: SECRET,
  LOG_LEVEL: 'info',
  FEED_WEIGHTS: ''
})

const S3_ENV = Object.freeze({ S3_BUCKET: 'junte-prod-photos', AWS_REGION: 'us-east-1' })

function errorOf (env) {
  try {
    loadConfig(env)
  } catch (err) {
    return err
  }
  throw new Error('loadConfig debía lanzar')
}

describe('loadConfig', () => {
  it('devuelve la configuración tipada y congelada', () => {
    const config = loadConfig(validEnv)

    expect(config).toEqual({
      env: 'development',
      isProduction: false,
      port: 3000,
      logLevel: 'info',
      mongo: { uri: validEnv.MONGO_URI, dbName: 'junte' },
      redis: { url: 'redis://localhost:6379' },
      jwt: { secret: SECRET },
      storage: null,
      feed: { weights: { interests: 0.5, distance: 0.3, schedule: 0.2 } },
      push: null,
      mail: null
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.mongo)).toBe(true)
  })

  it('sin MONGO_URI lanza un ConfigError que la nombra', () => {
    const { MONGO_URI, ...env } = validEnv
    const err = errorOf(env)

    expect(err).toBeInstanceOf(ConfigError)
    expect(err.variables).toEqual(['MONGO_URI'])
    expect(err.message).toMatch(/MONGO_URI: es obligatoria/)
  })

  it('una variable vacía (`VAR=` en .env) cuenta como ausente', () => {
    const err = errorOf({ ...validEnv, MONGO_URI: '  ' })
    expect(err.variables).toEqual(['MONGO_URI'])
  })

  it('informa todas las variables con problemas a la vez', () => {
    const err = errorOf({ ...validEnv, REDIS_URL: undefined, JWT_SECRET: undefined, PORT: 'abc' })
    expect(err.variables.sort()).toEqual(['JWT_SECRET', 'PORT', 'REDIS_URL'])
  })

  it('JWT_SECRET corto falla sin mostrar el valor', () => {
    const err = errorOf({ ...validEnv, JWT_SECRET: 'corto-y-secreto' })

    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).toMatch(/al menos 32 caracteres/)
    expect(err.message).not.toMatch(/corto-y-secreto/)
  })

  it('JWT_SECRET ausente pide correr task setup', () => {
    const err = errorOf({ ...validEnv, JWT_SECRET: '' })

    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).toMatch(/task setup/)
  })

  it('en producción rechaza un JWT_SECRET que está en el repo, sin mostrarlo', () => {
    const err = errorOf({ ...validEnv, ...S3_ENV, NODE_ENV: 'production' })

    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).toMatch(/repositorio/)
    expect(err.message).not.toContain(SECRET)
  })

  it('en producción rechaza también el secreto fijo de los tests de auth', () => {
    const err = errorOf({ ...validEnv, ...S3_ENV, NODE_ENV: 'production', JWT_SECRET: 'a-test-only-secret-with-at-least-32-chars!!' })

    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).toMatch(/repositorio/)
  })

  it('en producción acepta un JWT_SECRET que no está en el repo', () => {
    const config = loadConfig({ ...validEnv, ...S3_ENV, NODE_ENV: 'production', JWT_SECRET: randomBytes(32).toString('hex') })

    expect(config.isProduction).toBe(true)
  })

  it('fuera de producción acepta el JWT_SECRET de los tests', () => {
    expect(loadConfig(validEnv).jwt.secret).toBe(SECRET)
  })

  it('no muestra el valor de una URI inválida', () => {
    const err = errorOf({ ...validEnv, MONGO_URI: 'postgres://user:pass@db/x' })

    expect(err.variables).toEqual(['MONGO_URI'])
    expect(err.message).not.toMatch(/user:pass/)
  })

  it('aplica valores por defecto para NODE_ENV, PORT y LOG_LEVEL', () => {
    const { NODE_ENV, PORT, LOG_LEVEL, ...env } = validEnv
    const config = loadConfig(env)

    expect(config.env).toBe('development')
    expect(config.port).toBe(3000)
    expect(config.logLevel).toBe('info')
  })

  it.each([['0'], ['70000'], ['3.5']])('rechaza PORT=%s', (port) => {
    expect(errorOf({ ...validEnv, PORT: port }).variables).toEqual(['PORT'])
  })

  it('rechaza NODE_ENV y LOG_LEVEL fuera de la lista', () => {
    const err = errorOf({ ...validEnv, NODE_ENV: 'staging', LOG_LEVEL: 'verbose' })
    expect(err.variables.sort()).toEqual(['LOG_LEVEL', 'NODE_ENV'])
  })

  it('FEED_WEIGHTS es opcional: sin ella se usan los pesos del informe', () => {
    const { FEED_WEIGHTS, ...env } = validEnv
    expect(loadConfig(env).feed.weights).toEqual({ interests: 0.5, distance: 0.3, schedule: 0.2 })
  })

  it('FEED_WEIGHTS en JSON cambia los pesos', () => {
    const raw = '{"interests":0.2,"distance":0.7,"schedule":0.1}'
    expect(loadConfig({ ...validEnv, FEED_WEIGHTS: raw }).feed.weights).toEqual({ interests: 0.2, distance: 0.7, schedule: 0.1 })
  })

  it.each([
    ['no es JSON', '0.5,0.3,0.2'],
    ['no suman 1', '{"interests":0.5,"distance":0.5,"schedule":0.5}'],
    ['falta uno', '{"interests":0.5,"distance":0.5}'],
    ['sobra uno', '{"interests":0.5,"distance":0.3,"schedule":0.2,"reputation":0}'],
    ['peso negativo', '{"interests":1.2,"distance":-0.2,"schedule":0}'],
    ['peso que no es número', '{"interests":"0.5","distance":0.3,"schedule":0.2}']
  ])('FEED_WEIGHTS inválida (%s) → ConfigError que la nombra', (_label, raw) => {
    const err = errorOf({ ...validEnv, FEED_WEIGHTS: raw })
    expect(err).toBeInstanceOf(ConfigError)
    expect(err.variables).toEqual(['FEED_WEIGHTS'])
  })

  it('acepta mongodb+srv y rediss (TLS)', () => {
    const config = loadConfig({ ...validEnv, MONGO_URI: 'mongodb+srv://cluster.example', REDIS_URL: 'rediss://cache:6380' })
    expect(config.mongo.uri).toBe('mongodb+srv://cluster.example')
    expect(config.redis.url).toBe('rediss://cache:6380')
  })

  it('ignora variables que no son de la app', () => {
    expect(loadConfig({ ...validEnv, PATH: '/usr/bin', HOME: '/home/x' })).not.toHaveProperty('PATH')
  })

  describe('storage (S3)', () => {
    it('S3_BUCKET y AWS_REGION son opcionales fuera de producción: sin ellas no hay storage real', () => {
      expect(loadConfig(validEnv).storage).toBeNull()
      expect(loadConfig({ ...validEnv, NODE_ENV: 'test' }).storage).toBeNull()
    })

    it('con las dos variables expone { bucket, region }', () => {
      expect(loadConfig({ ...validEnv, ...S3_ENV }).storage).toEqual({ bucket: 'junte-prod-photos', region: 'us-east-1' })
    })

    it('en producción son obligatorias y el error las nombra', () => {
      const err = errorOf({ ...validEnv, NODE_ENV: 'production', JWT_SECRET: randomBytes(32).toString('hex') })

      expect(err.variables.sort()).toEqual(['AWS_REGION', 'S3_BUCKET'])
      expect(err.message).toMatch(/obligatoria en producción/)
    })

    it('definir solo una de las dos es un error también en desarrollo', () => {
      expect(errorOf({ ...validEnv, S3_BUCKET: 'junte-photos' }).variables).toEqual(['AWS_REGION'])
      expect(errorOf({ ...validEnv, AWS_REGION: 'us-east-1' }).variables).toEqual(['S3_BUCKET'])
    })

    it('una variable vacía (`S3_BUCKET=` en .env) cuenta como ausente', () => {
      expect(loadConfig({ ...validEnv, S3_BUCKET: '', AWS_REGION: '' }).storage).toBeNull()
    })

    it('valida el formato del bucket y de la región sin mostrar su valor', () => {
      const err = errorOf({ ...validEnv, S3_BUCKET: 'Bucket Con Espacios', AWS_REGION: 'región' })

      expect(err.variables.sort()).toEqual(['AWS_REGION', 'S3_BUCKET'])
      expect(err.message).not.toContain('Bucket Con Espacios')
    })

    it('no pide credenciales de AWS: vienen de la cadena por defecto del SDK / rol IAM', () => {
      const config = loadConfig({ ...validEnv, ...S3_ENV, AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'y' })

      expect(JSON.stringify(config)).not.toMatch(/AWS_ACCESS|AWS_SECRET|"x"|"y"/)
    })
  })
})

describe('FCM_SERVICE_ACCOUNT', () => {
  const account = {
    type: 'service_account',
    project_id: 'junte-dev',
    client_email: 'firebase-adminsdk@junte-dev.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
  }

  it('lee project_id, client_email y private_key del JSON', () => {
    expect(loadConfig({ ...validEnv, FCM_SERVICE_ACCOUNT: JSON.stringify(account) }).push).toEqual({
      fcm: { projectId: 'junte-dev', clientEmail: account.client_email, privateKey: account.private_key }
    })
  })

  it('un JSON inválido o incompleto la nombra sin mostrar el valor', () => {
    for (const raw of ['no-es-json', JSON.stringify({ ...account, private_key: undefined })]) {
      const err = errorOf({ ...validEnv, FCM_SERVICE_ACCOUNT: raw })
      expect(err.variables).toEqual(['FCM_SERVICE_ACCOUNT'])
      expect(err.message).not.toContain('junte-dev')
    }
  })
})

describe('RESEND_API_KEY y MAIL_FROM (emails)', () => {
  const MAIL_ENV = { RESEND_API_KEY: 're_clave_de_prueba_123', MAIL_FROM: 'junte <no-reply@junteapp.me>' }

  it('sin ninguna de las dos, mail es null (no sale ningún email)', () => {
    expect(loadConfig(validEnv).mail).toBeNull()
  })

  it('con las dos, deja la clave y el remitente', () => {
    expect(loadConfig({ ...validEnv, ...MAIL_ENV }).mail).toEqual({ resend: { apiKey: MAIL_ENV.RESEND_API_KEY }, from: MAIL_ENV.MAIL_FROM })
    expect(loadConfig({ ...validEnv, ...MAIL_ENV, MAIL_FROM: 'no-reply@junteapp.me' }).mail.from).toBe('no-reply@junteapp.me')
  })

  it('una sin la otra es un error que nombra la que falta', () => {
    expect(errorOf({ ...validEnv, RESEND_API_KEY: MAIL_ENV.RESEND_API_KEY }).variables).toEqual(['MAIL_FROM'])
    expect(errorOf({ ...validEnv, MAIL_FROM: MAIL_ENV.MAIL_FROM }).variables).toEqual(['RESEND_API_KEY'])
  })

  it('un remitente que no es un email, o una clave con espacios, se informan sin mostrar el valor', () => {
    const from = errorOf({ ...validEnv, ...MAIL_ENV, MAIL_FROM: 'junte sin direccion' })
    expect(from.variables).toEqual(['MAIL_FROM'])
    const key = errorOf({ ...validEnv, ...MAIL_ENV, RESEND_API_KEY: 're_clave con espacios' })
    expect(key.variables).toEqual(['RESEND_API_KEY'])
    expect(key.message).not.toContain('re_clave')
  })
})
