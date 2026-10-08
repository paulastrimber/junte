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
      feed: { weightsRaw: null }
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
    const err = errorOf({ ...validEnv, NODE_ENV: 'production' })

    expect(err.variables).toEqual(['JWT_SECRET'])
    expect(err.message).toMatch(/repositorio/)
    expect(err.message).not.toContain(SECRET)
  })

  it('en producción acepta un JWT_SECRET que no está en el repo', () => {
    const config = loadConfig({ ...validEnv, NODE_ENV: 'production', JWT_SECRET: randomBytes(32).toString('hex') })

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

  it('FEED_WEIGHTS es opcional y se pasa sin interpretar (formato pendiente)', () => {
    const raw = '{"interests":0.5,"distance":0.3,"schedule":0.2}'
    expect(loadConfig({ ...validEnv, FEED_WEIGHTS: raw }).feed.weightsRaw).toBe(raw)
  })

  it('acepta mongodb+srv y rediss (TLS)', () => {
    const config = loadConfig({ ...validEnv, MONGO_URI: 'mongodb+srv://cluster.example', REDIS_URL: 'rediss://cache:6380' })
    expect(config.mongo.uri).toBe('mongodb+srv://cluster.example')
    expect(config.redis.url).toBe('rediss://cache:6380')
  })

  it('ignora variables que no son de la app', () => {
    expect(loadConfig({ ...validEnv, PATH: '/usr/bin', HOME: '/home/x' })).not.toHaveProperty('PATH')
  })
})
