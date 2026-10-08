// Esquema y validación de las variables de entorno (S1-BE-02).
// Función pura: no lee process.env ni termina el proceso, para poder testearla.
// Los mensajes de error nombran la variable pero NUNCA incluyen su valor (puede ser un secreto).
import { z } from 'zod'

const JWT_SECRET_MIN_LENGTH = 32
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
const NODE_ENVS = ['development', 'test', 'production']

const required = (hint) => ({
  error: (issue) => (issue.input === undefined ? 'es obligatoria' : hint)
})

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS, { error: `debe ser uno de: ${NODE_ENVS.join(', ')}` }).default('development'),
  PORT: z.coerce.number({ error: 'debe ser un número' })
    .int({ error: 'debe ser un entero' })
    .min(1, { error: 'debe estar entre 1 y 65535' })
    .max(65535, { error: 'debe estar entre 1 y 65535' })
    .default(3000),
  MONGO_URI: z.string(required('debe ser texto'))
    .regex(/^mongodb(\+srv)?:\/\//, { error: 'debe empezar con mongodb:// o mongodb+srv://' }),
  MONGO_DB_NAME: z.string(required('debe ser texto'))
    .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'solo letras, números, "_" y "-" (máx. 64)' }),
  REDIS_URL: z.string(required('debe ser texto'))
    .regex(/^rediss?:\/\//, { error: 'debe empezar con redis:// o rediss://' }),
  JWT_SECRET: z.string(required('debe ser texto'))
    .min(JWT_SECRET_MIN_LENGTH, { error: `debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres` }),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: `debe ser uno de: ${LOG_LEVELS.join(', ')}` }).default('info'),
  // TODO(S3-BE): formato pendiente (docs/pendientes.md#pesos-del-feed). Por ahora solo se acepta
  // y se pasa tal cual; el módulo de feed lo validará cuando se defina el formato.
  FEED_WEIGHTS: z.string().optional()
})

/** Error de configuración: el proceso no debe arrancar. `variables` lista solo nombres. */
export class ConfigError extends Error {
  /** @param {Array<{ variable: string, problem: string }>} problems */
  constructor (problems) {
    const lines = problems.map(({ variable, problem }) => `  - ${variable}: ${problem}`)
    super(`Configuración inválida. Revisá estas variables de entorno:\n${lines.join('\n')}`)
    this.name = 'ConfigError'
    this.problems = problems
    this.variables = problems.map(({ variable }) => variable)
  }
}

// En un .env, `VAR=` deja un string vacío: se trata igual que una variable ausente.
function withoutEmptyValues (env) {
  return Object.fromEntries(
    Object.keys(envSchema.shape)
      .map((key) => [key, env[key]])
      .filter(([, value]) => value !== undefined && String(value).trim() !== '')
  )
}

/**
 * Valida las variables de entorno y devuelve la configuración tipada y congelada.
 * @param {Record<string, string | undefined>} env  Normalmente `process.env`.
 * @returns {Readonly<AppConfig>}
 * @throws {ConfigError} si falta o es inválida alguna variable (el mensaje nombra cuáles).
 */
export function loadConfig (env) {
  const result = envSchema.safeParse(withoutEmptyValues(env ?? {}))
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => ({
      variable: issue.path.join('.') || '(entorno)',
      problem: issue.message
    })))
  }

  const vars = result.data
  return deepFreeze({
    env: vars.NODE_ENV,
    isProduction: vars.NODE_ENV === 'production',
    port: vars.PORT,
    logLevel: vars.LOG_LEVEL,
    mongo: { uri: vars.MONGO_URI, dbName: vars.MONGO_DB_NAME },
    redis: { url: vars.REDIS_URL },
    jwt: { secret: vars.JWT_SECRET },
    feed: { weightsRaw: vars.FEED_WEIGHTS ?? null }
  })
}

function deepFreeze (object) {
  Object.values(object)
    .filter((value) => value !== null && typeof value === 'object')
    .forEach(deepFreeze)
  return Object.freeze(object)
}

/**
 * @typedef {object} AppConfig
 * @property {'development' | 'test' | 'production'} env
 * @property {boolean} isProduction
 * @property {number} port
 * @property {string} logLevel
 * @property {{ uri: string, dbName: string }} mongo
 * @property {{ url: string }} redis
 * @property {{ secret: string }} jwt
 * @property {{ weightsRaw: string | null }} feed
 */
