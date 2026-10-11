// Base de datos para tests de integración y contrato: MongoMemoryReplSet de 1 nodo (replica set →
// transacciones), conectado con el mismo `connectDb` que usa la app y con las migraciones reales
// aplicadas (los mismos archivos que `migrate-mongo up`). Ver docs/practicas/testing.md.
//
// Uso típico:
//   import { useTestDb } from '../helpers/db.js'
//   useTestDb()   // beforeAll: arranca + migra · beforeEach: limpia datos · afterAll: apaga
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { connectDb, disconnectDb, getConnection } from '../../src/adapters/db/index.js'
import { runMigrations } from '../../src/adapters/db/migrations.js'

const TEST_DB_NAME = 'junte_test'
// Se conservan entre tests: las colecciones de migrate-mongo (la base sigue "migrada") y los catálogos, que son datos
// de referencia cargados por la migración (los tests de perfil dependen de ellos). Un test que agrega filas a un catálogo
// las crea con una key `test-…` y las borra al terminar (ver `removeTestCatalogRows`).
export const CATALOG_COLLECTIONS = ['interestCategories', 'interests', 'universities', 'careers', 'cities', 'neighborhoods']
const KEEP = new Set(['changelog', 'changelog_lock', ...CATALOG_COLLECTIONS])

let replSet = null

/**
 * Arranca un replica set en memoria, conecta Mongoose y aplica todas las migraciones.
 * @returns {Promise<{ uri: string, dbName: string }>}
 */
export async function startDb () {
  if (replSet) throw new Error('startDb: ya hay una base de test levantada en este archivo')
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const uri = replSet.getUri()
  await connectDb(uri, { dbName: TEST_DB_NAME })
  const connection = getConnection()
  await runMigrations(connection.db, connection.getClient())
  return { uri, dbName: TEST_DB_NAME }
}

/** Borra los documentos de todas las colecciones, conservando índices y validadores. */
export async function clearDb () {
  const { db } = getConnection()
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()
  await Promise.all(
    collections
      .filter(({ name }) => !KEEP.has(name) && !name.startsWith('system.'))
      .map(({ name }) => db.collection(name).deleteMany({}))
  )
}

/** Borra las filas de catálogo que un test creó (las de key `test-…`) y devuelve los catálogos a su estado inicial. */
export async function removeTestCatalogRows () {
  const { db } = getConnection()
  await Promise.all(CATALOG_COLLECTIONS.map((name) => db.collection(name).deleteMany({ key: /^test-/ })))
}

/** Desconecta Mongoose y apaga el replica set. Idempotente. */
export async function stopDb () {
  await disconnectDb()
  if (replSet) {
    await replSet.stop()
    replSet = null
  }
}

/** Registra los hooks de vitest: base migrada por archivo de test y datos limpios por test. */
export function useTestDb () {
  beforeAll(startDb)
  beforeEach(clearDb)
  afterAll(stopDb)
}
