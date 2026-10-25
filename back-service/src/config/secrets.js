// Secretos de producción (S1-BE-02; decidido el 2026-10-21: SDK al arrancar, informe 5.3).
// Si el entorno trae JWT_SECRET_ID o MONGO_URI_SECRET_ID (nombre o ARN del secreto, lo pone
// infra/templates/40-back.yml), se leen de Secrets Manager y completan JWT_SECRET y MONGO_URI antes
// de validar la configuración. Sin esas variables (local, tests) el entorno queda como está.
// Los errores nombran variables y secretos, nunca valores ni el mensaje del SDK.
import { ConfigError } from './env.js'

/** Variable con el nombre del secreto → variable que completa. */
export const SECRET_REFERENCES = Object.freeze({
  JWT_SECRET_ID: 'JWT_SECRET',
  MONGO_URI_SECRET_ID: 'MONGO_URI'
})

/**
 * @typedef {{ getSecretString: (secretId: string) => Promise<string | undefined> }} SecretsClient
 * @param {Record<string, string | undefined>} env
 * @param {{ createClient: (options: { region: string }) => Promise<SecretsClient> }} deps
 * @returns {Promise<Record<string, string | undefined>>} un entorno nuevo; `env` no se modifica.
 * @throws {ConfigError} si falta AWS_REGION, si viene el valor junto con su referencia o si un secreto no se puede leer.
 */
export async function resolveSecrets (env, { createClient }) {
  const wanted = Object.entries(SECRET_REFERENCES).filter(([reference]) => env[reference])
  if (wanted.length === 0) return env

  const problems = []
  for (const [reference, target] of wanted) {
    if (env[target] !== undefined) {
      problems.push({ variable: target, problem: `no se puede definir junto con ${reference}: el valor sale de Secrets Manager` })
    }
  }
  if (!env.AWS_REGION) {
    const references = wanted.map(([reference]) => reference).join(' y ')
    problems.push({ variable: 'AWS_REGION', problem: `es obligatoria para leer ${references} de Secrets Manager` })
  }
  if (problems.length > 0) throw new ConfigError(problems)

  const client = await createClient({ region: env.AWS_REGION })
  const results = await Promise.allSettled(wanted.map(([reference]) => readSecret(client, env[reference])))

  const resolved = { ...env }
  results.forEach((result, index) => {
    const [reference, target] = wanted[index]
    if (result.status === 'fulfilled') {
      resolved[target] = result.value
    } else {
      // Solo el nombre del error (AccessDeniedException, ResourceNotFoundException…): el mensaje del SDK no se copia.
      problems.push({ variable: reference, problem: `no se pudo leer el secreto "${env[reference]}" (${result.reason?.name ?? 'Error'})` })
    }
  })
  if (problems.length > 0) throw new ConfigError(problems)
  return resolved
}

async function readSecret (client, secretId) {
  const value = await client.getSecretString(secretId)
  if (typeof value !== 'string' || value === '') {
    throw Object.assign(new Error('sin SecretString'), { name: 'EmptySecret' })
  }
  return value
}
