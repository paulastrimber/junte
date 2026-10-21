// Cliente de AWS Secrets Manager para leer los secretos al arrancar (S1-BE-02).
// Credenciales: cadena por defecto del SDK (rol IAM de la instancia en AWS); nunca por código.
// Solo lo carga config/index.js cuando el entorno trae JWT_SECRET_ID o MONGO_URI_SECRET_ID.
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

// Si Secrets Manager no responde, el arranque falla en segundos en lugar de quedar colgado.
const CONNECTION_TIMEOUT_MS = 3000
const REQUEST_TIMEOUT_MS = 5000

/**
 * @param {{ region: string }} options
 * @returns {Promise<import('../config/secrets.js').SecretsClient>}
 */
export async function createSecretsManagerClient ({ region }) {
  const client = new SecretsManagerClient({
    region,
    requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS }
  })
  return {
    async getSecretString (secretId) {
      const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }))
      return SecretString
    }
  }
}
