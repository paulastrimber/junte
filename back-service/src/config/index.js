// Configuración del proceso (S1-BE-02). Nunca guardar secretos en el repo.
// Importar este archivo valida process.env: si algo falta o es inválido, el proceso termina
// con código 1 y un mensaje que nombra las variables (sin sus valores).
// En tests usar `loadConfig(env)` de ./env.js, que es puro y no termina el proceso.
import { ConfigError, loadConfig } from './env.js'
import { resolveSecrets } from './secrets.js'

export { ConfigError, loadConfig }

// El SDK se importa solo si hace falta: en local y en tests no hay *_SECRET_ID y no se carga.
const createClient = async (options) => {
  const { createSecretsManagerClient } = await import('../adapters/secretsManager.js')
  return createSecretsManagerClient(options)
}

async function loadConfigOrExit (env) {
  try {
    // En AWS, JWT_SECRET y MONGO_URI salen de Secrets Manager (ver ./secrets.js).
    return loadConfig(await resolveSecrets(env, { createClient }))
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    // El logger todavía no existe (depende de LOG_LEVEL): stderr directo, sin valores.
    process.stderr.write(`${err.message}\n`)
    process.exit(1)
  }
}

/** @type {Readonly<import('./env.js').AppConfig>} */
export const config = await loadConfigOrExit(process.env)
