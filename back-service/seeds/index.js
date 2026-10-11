// `npm run seed` / `task db:seed`: datos de desarrollo. Nunca en AWS.
// Lee MONGO_URI y MONGO_DB_NAME de process.env (el script npm carga `.env` si existe).
// También lee SEED_PASSWORD: la contraseña (hasheada con Argon2id) de todos los usuarios de ejemplo.
// No loguea la URI, contraseñas ni coordenadas: solo cuántos documentos quedaron.
import { connectDb, disconnectDb, getConnection } from '../src/adapters/db/index.js'
import { createArgon2Hasher } from '../src/adapters/passwordHasher.js'
import { seed } from './seed.js'

async function assertMigrated () {
  const indexes = await getConnection().db.collection('users').indexes().catch(() => [])
  if (!indexes.some((index) => index.name === 'email_unique')) {
    throw new Error('la base no tiene las migraciones aplicadas; corré `task db:migrate` antes del seed')
  }
}

async function main () {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('los seeds son solo para desarrollo (NODE_ENV=production)')
  }
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('falta MONGO_URI (copiá .env.example a .env o corré `task setup`)')
  const password = process.env.SEED_PASSWORD
  if (!password) throw new Error('falta SEED_PASSWORD: la contraseña de los usuarios de ejemplo (definila en back-service/.env)')

  await connectDb(uri, { dbName: process.env.MONGO_DB_NAME || 'junte' })
  try {
    await assertMigrated()
    const result = await seed({ passwordHasher: createArgon2Hasher(), password })
    console.log(`seed OK: ${result.users} usuarios (1 admin), ${result.plans} planes, ${result.participations} inscripciones`)
  } finally {
    await disconnectDb()
  }
}

try {
  await main()
} catch (err) {
  console.error(`seed FALLÓ: ${err.message}`)
  process.exitCode = 1
}
