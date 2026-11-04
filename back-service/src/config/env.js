// Esquema y validación de las variables de entorno (S1-BE-02).
// Función pura: no lee process.env ni termina el proceso, para poder testearla.
// Los mensajes de error nombran la variable pero NUNCA incluyen su valor (puede ser un secreto).
import { createHash } from 'node:crypto'
import { z } from 'zod'

const JWT_SECRET_MIN_LENGTH = 32
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
const NODE_ENVS = ['development', 'test', 'production']

// SHA-256 de los valores de JWT_SECRET que aparecen (o aparecieron) en el repo: el viejo valor fijo
// del entrypoint de desarrollo y el de los tests. Se guarda el hash para no volver a escribir el valor.
// Producción los rechaza. Si un test o script agrega otro valor fijo, sumar su hash acá.
const SECRETS_KNOWN_FROM_REPO = new Set([
  '0aa0b382413dd769d65f621ad30d63029202190501d57c36f6495a6095aa1692', // infra/back/dev-entrypoint.sh (historial)
  'c62e4615bd39e222572f3a1bf7c2132ea1e65b17ec805047bd6b2842c593493f', // src/config/env.test.js
  'a974979f681cb1630334beb554f69a022adddc7785b9abf255bd2eb19152c479' // tests/helpers/modules.js y src/modules/auth/tokens.test.js (secreto de los tests de auth)
])

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** Pesos del score del feed según el informe (docs/pendientes.md#pesos-del-feed). */
export const DEFAULT_FEED_WEIGHTS = Object.freeze({ interests: 0.5, distance: 0.3, schedule: 0.2 })
const WEIGHTS_SUM_TOLERANCE = 1e-6

const weightsShape = z.strictObject({
  interests: z.number().min(0).max(1),
  distance: z.number().min(0).max(1),
  schedule: z.number().min(0).max(1)
})

// JSON `{"interests":0.5,"distance":0.3,"schedule":0.2}`: los tres pesos, entre 0 y 1, que sumen 1.
// Un solo problema por variable: el mensaje nombra FEED_WEIGHTS, no cada peso.
const feedWeightsField = z.string().transform((text, ctx) => {
  const fail = (message) => {
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return fail('debe ser JSON, por ejemplo {"interests":0.5,"distance":0.3,"schedule":0.2}')
  }
  const parsed = weightsShape.safeParse(json)
  if (!parsed.success) return fail('debe tener exactamente interests, distance y schedule (números entre 0 y 1)')
  const { interests, distance, schedule } = parsed.data
  if (Math.abs(interests + distance + schedule - 1) > WEIGHTS_SUM_TOLERANCE) return fail('los pesos deben sumar 1')
  return parsed.data
})

// Cuenta de servicio de Firebase (S5-BE-07): el JSON que se descarga de la consola de Firebase, en una sola línea.
// Es un secreto: los mensajes nunca incluyen el valor. Solo se usan project_id, client_email y private_key.
const fcmServiceAccountField = z.string().transform((text, ctx) => {
  const fail = () => {
    ctx.addIssue({ code: 'custom', message: 'debe ser el JSON de la cuenta de servicio de Firebase (con project_id, client_email y private_key)' })
    return z.NEVER
  }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return fail()
  }
  const parsed = z.object({
    project_id: z.string().regex(/^[a-z0-9-]{4,64}$/),
    client_email: z.email(),
    private_key: z.string().includes('PRIVATE KEY')
  }).safeParse(json)
  if (!parsed.success) return fail()
  return { projectId: parsed.data.project_id, clientEmail: parsed.data.client_email, privateKey: parsed.data.private_key }
})

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
  JWT_SECRET: z.string({
    error: (issue) => (issue.input === undefined
      ? 'es obligatoria; en desarrollo corré `task setup` para generarla en back-service/.env'
      : 'debe ser texto')
  })
    .min(JWT_SECRET_MIN_LENGTH, { error: `debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres` }),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: `debe ser uno de: ${LOG_LEVELS.join(', ')}` }).default('info'),
  // Pesos del score del feed (S3-BE-06). Opcional: sin ella se usan los del informe.
  FEED_WEIGHTS: feedWeightsField.optional(),
  // Push (S5-BE-07). Opcional: sin ella los avisos no salen del back (se loguean); en AWS sale de Secrets Manager
  // (FCM_SERVICE_ACCOUNT_SECRET_ID, ver ./secrets.js).
  FCM_SERVICE_ACCOUNT: fcmServiceAccountField.optional(),
  // Fotos en S3 (S2-BE-09). Opcionales fuera de producción: sin ellas se usa el storage en memoria.
  // Las credenciales NO son variables de la app: salen de la cadena por defecto del SDK / rol IAM.
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, { error: 'no es un nombre de bucket válido' }).optional(),
  AWS_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, { error: 'no es una región de AWS válida (ej: us-east-1)' }).optional()
}).superRefine((vars, ctx) => {
  const isProduction = vars.NODE_ENV === 'production'
  for (const [name, other] of [['S3_BUCKET', 'AWS_REGION'], ['AWS_REGION', 'S3_BUCKET']]) {
    if (vars[name] !== undefined) continue
    if (isProduction) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'es obligatoria en producción' })
    } else if (vars[other] !== undefined) {
      ctx.addIssue({ code: 'custom', path: [name], message: `hay que definirla junto con ${other}` })
    }
  }
  if (vars.NODE_ENV === 'production' && SECRETS_KNOWN_FROM_REPO.has(sha256(vars.JWT_SECRET))) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'usa un valor que está en el repositorio; en producción tiene que venir de Secrets Manager'
    })
  }
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
    storage: vars.S3_BUCKET && vars.AWS_REGION ? { bucket: vars.S3_BUCKET, region: vars.AWS_REGION } : null,
    feed: { weights: { ...(vars.FEED_WEIGHTS ?? DEFAULT_FEED_WEIGHTS) } },
    push: vars.FCM_SERVICE_ACCOUNT ? { fcm: vars.FCM_SERVICE_ACCOUNT } : null
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
 * @property {{ bucket: string, region: string } | null} storage  null → storage en memoria (solo desarrollo/test).
 * @property {{ weights: { interests: number, distance: number, schedule: number } }} feed  Pesos del score del feed (suman 1).
 * @property {{ fcm: { projectId: string, clientEmail: string, privateKey: string } } | null} push  null → los avisos push no
 *   salen (implementación en memoria que solo los loguea).
 */
