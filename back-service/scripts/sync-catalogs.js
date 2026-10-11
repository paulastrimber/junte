// `npm run catalogs:sync`: inserta en la base las entradas nuevas de catalogs/ (intereses, universidades, carreras,
// ciudades, barrios). Solo inserta lo que falta: nunca pisa lo que el admin editó ni borra nada. Idempotente.
// Lee MONGO_URI y MONGO_DB_NAME de process.env (el script npm carga `.env` si existe). Seguro en producción.
import { syncCatalogs } from '../catalogs/index.js'
import { connectDb, disconnectDb, getConnection } from '../src/adapters/db/index.js'

async function main () {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('falta MONGO_URI (copiá .env.example a .env o corré `task setup`)')
  await connectDb(uri, { dbName: process.env.MONGO_DB_NAME || 'junte' })
  try {
    const inserted = await syncCatalogs(getConnection().db)
    const summary = Object.entries(inserted).map(([name, count]) => `${name}: ${count}`).join(', ')
    console.log(`catalogs:sync OK — nuevas entradas (${summary})`)
  } finally {
    await disconnectDb()
  }
}

try {
  await main()
} catch (err) {
  console.error(`catalogs:sync FALLÓ: ${err.message}`)
  process.exitCode = 1
}
