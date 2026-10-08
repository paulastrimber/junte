// Healthcheck del servicio `mongo` en infra/docker-compose.dev.yml (se ejecuta con mongosh).
// 1. Si el replica set no está iniciado, lo inicia (idempotente: la config queda en el volumen,
//    así que en un `down`/`up` o un reinicio ya está iniciado y no se toca).
// 2. Sale con 0 solo cuando este nodo es PRIMARY (recién ahí se aceptan escrituras y transacciones).
// El miembro se anuncia como mongo:27017 (nombre del servicio en la red de compose). Desde el host
// hay que conectar con directConnection=true (ver back-service/.env.example).
const RS_CONFIG = { _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }

try {
  rs.status()
} catch (err) {
  if (err.codeName !== 'NotYetInitialized') throw err
  print('rs0 no iniciado: rs.initiate()')
  rs.initiate(RS_CONFIG)
}

if (!db.hello().isWritablePrimary) {
  print('rs0 todavía sin PRIMARY')
  quit(1)
}
