// Configuración de migrate-mongo (ESM). Ver docs/practicas/migraciones.md.
// Lee MONGO_URI y MONGO_DB_NAME de process.env. `npx migrate-mongo` no carga `.env`, así que si
// existe `back-service/.env` se carga acá (sin pisar variables ya definidas en el entorno).
// En AWS las variables vienen del paso de despliegue (Secrets Manager), no de un archivo.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.join(here, '.env')

if (existsSync(envFile)) process.loadEnvFile(envFile)

export default {
  mongodb: {
    url: process.env.MONGO_URI,
    databaseName: process.env.MONGO_DB_NAME || 'junte',
    options: {}
  },
  // Absoluta: funciona aunque migrate-mongo se invoque desde otro directorio.
  migrationsDir: path.join(here, 'migrations'),
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 300,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
}
