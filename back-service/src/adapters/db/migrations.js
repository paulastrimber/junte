// Ejecución programática de migrate-mongo: la usan el helper de tests y `npm run migrate:check`.
// Aplica exactamente los mismos archivos de `migrations/` que `migrate-mongo up`, con la misma
// colección `changelog`. No se llama al arrancar la app (con 2+ instancias competirían):
// en AWS las migraciones son un paso del despliegue.
import { config as migrateConfig, up, down, status } from 'migrate-mongo'
import baseConfig from '../../../migrate-mongo-config.js'

function useConfig (db) {
  // migrate-mongo lee la configuración de un singleton; se fija acá para no depender del cwd.
  migrateConfig.set({
    ...baseConfig,
    mongodb: { ...baseConfig.mongodb, databaseName: db.databaseName }
  })
}

/**
 * Aplica las migraciones pendientes, en orden.
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').MongoClient} [client]
 * @returns {Promise<string[]>} archivos aplicados.
 */
export async function runMigrations (db, client) {
  useConfig(db)
  return up(db, client)
}

/**
 * Revierte todas las migraciones aplicadas, de la última a la primera.
 * Solo para bases efímeras (tests, migrate:check): `down` quita índices y validadores.
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').MongoClient} [client]
 * @returns {Promise<string[]>} archivos revertidos.
 */
export async function rollbackMigrations (db, client) {
  useConfig(db)
  const reverted = []
  for (;;) {
    const applied = (await status(db)).filter((item) => item.appliedAt !== 'PENDING')
    if (applied.length === 0) return reverted
    const [fileName] = await down(db, client)
    if (!fileName) throw new Error('migrate-mongo down no revirtió ninguna migración')
    reverted.push(fileName)
  }
}

/**
 * Estado de cada migración (`appliedAt` es 'PENDING' si falta aplicarla).
 * @param {import('mongodb').Db} db
 * @returns {Promise<Array<{ fileName: string, appliedAt: Date | 'PENDING' }>>}
 */
export async function migrationStatus (db) {
  useConfig(db)
  return status(db)
}
