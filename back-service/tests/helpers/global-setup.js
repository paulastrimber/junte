import { MongoBinary } from 'mongodb-memory-server'

// Resuelve (y descarga si falta) el binario de mongod una sola vez, antes de lanzar los workers.
// Sin esto, varios archivos de test en paralelo compiten por el lockfile de la descarga y fallan.
// Los workers heredan MONGOMS_SYSTEM_BINARY y no vuelven a pasar por la descarga.
export default async function setup () {
  if (!process.env.MONGOMS_SYSTEM_BINARY) {
    process.env.MONGOMS_SYSTEM_BINARY = await MongoBinary.getPath()
  }
}
