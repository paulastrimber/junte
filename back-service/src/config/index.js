// Configuración del proceso (S1-BE-02). Nunca guardar secretos en el repo.
// Importar este archivo valida process.env: si algo falta o es inválido, el proceso termina
// con código 1 y un mensaje que nombra las variables (sin sus valores).
// En tests usar `loadConfig(env)` de ./env.js, que es puro y no termina el proceso.
import { ConfigError, loadConfig } from './env.js'

export { ConfigError, loadConfig }

/**
 * Punto de extensión para producción: los secretos viven en AWS Secrets Manager.
 * TODO(S1-INF-07): definir cómo llegan los secretos a la instancia (SDK al arrancar vs. inyectados
 * como variables por el user-data/systemd) y, si es por SDK, agregar `@aws-sdk/client-secrets-manager`
 * y mezclar acá el secreto con `env`. Ver docs/pendientes.md (back-core).
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<Record<string, string | undefined>>}
 */
async function resolveSecrets (env) {
  return env
}

async function loadConfigOrExit (env) {
  try {
    return loadConfig(await resolveSecrets(env))
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    // El logger todavía no existe (depende de LOG_LEVEL): stderr directo, sin valores.
    process.stderr.write(`${err.message}\n`)
    process.exit(1)
  }
}

/** @type {Readonly<import('./env.js').AppConfig>} */
export const config = await loadConfigOrExit(process.env)
