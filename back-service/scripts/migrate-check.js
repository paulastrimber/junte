// `npm run migrate:check` (lo corre CI): up → down → up de todas las migraciones sobre un
// MongoMemoryReplSet efímero. NUNCA contra la base de desarrollo ni la de AWS: `down` quita índices
// y validadores. Por eso ignora MONGO_URI a propósito.
// Exit code 0 si todo está bien; 1 si algo falla.
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { runMigrations, rollbackMigrations, migrationStatus } from '../src/adapters/db/migrations.js'
import { findIndexProblems, findLeftoverIndexes } from '../src/adapters/db/expected-indexes.js'

const { MongoClient } = mongoose.mongo
const DB_NAME = 'junte_migrate_check'

function fail (message) {
  throw new Error(message)
}

async function expectAllApplied (db, step) {
  const pending = (await migrationStatus(db)).filter((item) => item.appliedAt === 'PENDING')
  if (pending.length > 0) fail(`${step}: quedaron migraciones pendientes: ${pending.map((i) => i.fileName).join(', ')}`)
  const problems = await findIndexProblems(db)
  if (problems.length > 0) fail(`${step}: índices distintos a 07-modelo-de-datos.md:\n  - ${problems.join('\n  - ')}`)
}

async function expectAllReverted (db) {
  const applied = (await migrationStatus(db)).filter((item) => item.appliedAt !== 'PENDING')
  if (applied.length > 0) fail(`down: siguen aplicadas: ${applied.map((i) => i.fileName).join(', ')}`)
  const leftovers = await findLeftoverIndexes(db)
  if (leftovers.length > 0) fail(`down: quedaron índices sin borrar: ${leftovers.join(', ')}`)
}

async function main () {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  const client = new MongoClient(replSet.getUri())
  try {
    await client.connect()
    const db = client.db(DB_NAME)

    const applied = await runMigrations(db, client)
    if (applied.length === 0) fail('up: no hay migraciones para aplicar')
    await expectAllApplied(db, 'up')
    console.log(`up      ✔ ${applied.length} migraciones aplicadas`)

    const reverted = await rollbackMigrations(db, client)
    await expectAllReverted(db)
    console.log(`down    ✔ ${reverted.length} migraciones revertidas`)

    const reapplied = await runMigrations(db, client)
    await expectAllApplied(db, 'up (2)')
    console.log(`up (2)  ✔ ${reapplied.length} migraciones aplicadas; índices de 07 presentes`)
  } finally {
    await client.close().catch(() => {})
    await replSet.stop().catch(() => {})
  }
}

try {
  await main()
  console.log('migrate:check OK')
} catch (err) {
  console.error(`migrate:check FALLÓ: ${err.message}`)
  process.exitCode = 1
}
