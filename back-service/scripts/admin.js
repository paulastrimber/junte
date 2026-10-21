// `npm run admin -- <comando> <email>`: crea o promueve la primera cuenta de administración (S6-BE-04). No hay ningún
// endpoint para esto: el rol admin solo cambia por este script, por una migración o por un seed (ADR-0004).
//
//   npm run admin -- promote ana@um.edu.uy          → le da el rol admin a una cuenta que ya existe
//   npm run admin -- create ana@um.edu.uy "Ana"     → crea una cuenta admin; la contraseña sale de ADMIN_PASSWORD
//   npm run admin -- demote ana@um.edu.uy           → le quita el rol (nunca a la última cuenta admin activa)
//
// La contraseña va por variable de entorno y no como argumento, para que no quede en el historial de la terminal ni en
// la lista de procesos. Lee MONGO_URI y MONGO_DB_NAME de process.env (el script npm carga `.env` si existe).
// Seguro en producción. No loguea la URI ni la contraseña.
import { connectDb, disconnectDb } from '../src/adapters/db/index.js'
import { createArgon2Hasher } from '../src/adapters/passwordHasher.js'
import { createAdmin, demoteAdmin, promoteAdmin } from './admin-accounts.js'

const USAGE = 'uso: npm run admin -- promote <email> | create <email> "<nombre>" | demote <email>'

async function run ([command, email, name]) {
  if (command === 'promote') {
    const { changed, status } = await promoteAdmin({ email })
    const warning = status === 'suspended' ? ' (ojo: la cuenta está suspendida y no puede iniciar sesión)' : ''
    return changed ? `admin OK: ${email} ahora es admin${warning}` : `admin OK: ${email} ya era admin${warning}`
  }
  if (command === 'create') {
    await createAdmin({ email, name, password: process.env.ADMIN_PASSWORD, passwordHasher: createArgon2Hasher() })
    return `admin OK: se creó la cuenta admin ${email}`
  }
  if (command === 'demote') {
    const { changed } = await demoteAdmin({ email })
    return changed ? `admin OK: ${email} ya no es admin` : `admin OK: ${email} no era admin`
  }
  throw new Error(USAGE)
}

async function main () {
  const args = process.argv.slice(2)
  if (args.length < 2) throw new Error(USAGE)
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('falta MONGO_URI (copiá .env.example a .env o corré `task setup`)')
  await connectDb(uri, { dbName: process.env.MONGO_DB_NAME || 'junte' })
  try {
    console.log(await run(args))
  } finally {
    await disconnectDb()
  }
}

try {
  await main()
} catch (err) {
  console.error(`admin FALLÓ: ${err.message}`)
  process.exitCode = 1
}
