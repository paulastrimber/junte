#!/bin/bash
# Inicia el replica set rs0, crea los usuarios y suma los miembros que falten (paso 1.6 del plan). Corre por
# Session Manager en el nodo del primer host de HOSTS (lo manda `task aws:mongo-init`). Se puede repetir: lo
# que ya existe se saltea; con HOSTS de 3 sobre un replica set de 1, agrega los otros dos.
# Entorno: ENV_NAME (dev|entrega), REGION, HOSTS (ip:puerto separados por coma, el primero es este nodo).
# Los secretos se leen acá adentro y pasan a mongosh por el entorno: nunca aparecen en la salida.
set -euo pipefail
: "${ENV_NAME:?}" "${REGION:?}" "${HOSTS:?}"

first_ip=${HOSTS%%:*}
hostname -I | tr ' ' '\n' | grep -qx "$first_ip" || { echo "este nodo no es $first_ip (el primer host)" >&2; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' mongo 2>/dev/null)" = true ] || { echo 'el contenedor mongo no está corriendo' >&2; exit 1; }

get () { aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/$1" --query SecretString --output text; }
ADMIN_JSON=$(get mongo-admin)
APP_JSON=$(get mongo-app)
MIG_JSON=$(get mongo-migrations)
BACKUP_JSON=$(get mongo-backup)
export ADMIN_JSON APP_JSON MIG_JSON BACKUP_JSON HOSTS

docker exec -i -e ADMIN_JSON -e APP_JSON -e MIG_JSON -e BACKUP_JSON -e HOSTS mongo mongosh --quiet --nodb <<'JS'
const parse = (name) => JSON.parse(process.env[name])
const hosts = process.env.HOSTS.split(',')
const local = connect('mongodb://127.0.0.1:27017/admin?directConnection=true')

// 1. Replica set. El primer miembro arranca con prioridad 2 para que gane la elección: la excepción de
// localhost (crear el primer usuario sin autenticarse) solo funciona en el primario.
let initiated = false
try {
  local.adminCommand({ replSetGetStatus: 1 })
  print('replica set: ya estaba iniciado')
} catch (e) {
  if (e.codeName === 'NotYetInitialized') {
    local.adminCommand({ replSetInitiate: { _id: 'rs0', members: hosts.map((host, i) => ({ _id: i, host, priority: i === 0 ? 2 : 1 })) } })
    initiated = true
    print('replica set: iniciado con ' + hosts.length + ' miembro(s): ' + hosts.join(', '))
  } else if (e.codeName === 'Unauthorized') {
    print('replica set: ya estaba iniciado (pide autenticación)')
  } else throw e
}
// 2. Usuarios. Si el admin ya existe, se trabaja contra el replica set (el driver encuentra al primario,
// esté donde esté). Si no, hace falta la excepción de localhost: este nodo tiene que ser el primario.
const admin = parse('ADMIN_JSON')
let conn = null
if (!initiated) {
  try {
    const rs = connect('mongodb://' + hosts.join(',') + '/admin?replicaSet=rs0')
    rs.auth(admin.username, admin.password)
    conn = rs
    print('usuario ' + admin.username + ': ya existía')
  } catch (e) {
    // Todavía no hay admin: sigue por la excepción de localhost.
  }
}
if (!conn) {
  for (let i = 0; i < 90 && !local.adminCommand({ hello: 1 }).isWritablePrimary; i++) sleep(1000)
  if (!local.adminCommand({ hello: 1 }).isWritablePrimary) throw new Error('este nodo no llegó a primario en 90 s')
  print('primario: ' + hosts[0])
  try {
    local.createUser({ user: admin.username, pwd: admin.password, roles: ['root'] })
    print('usuario ' + admin.username + ': creado (root)')
  } catch (e) {
    if (e.codeName === 'Unauthorized' || e.codeName === 'Location51003') print('usuario ' + admin.username + ': ya existía')
    else throw e
  }
  local.auth(admin.username, admin.password)
  conn = local
}
const users = [
  [parse('APP_JSON'), 'junte', [{ role: 'readWrite', db: 'junte' }]],
  [parse('MIG_JSON'), 'junte', [{ role: 'readWrite', db: 'junte' }, { role: 'dbAdmin', db: 'junte' }]],
  [parse('BACKUP_JSON'), 'admin', [{ role: 'backup', db: 'admin' }]]
]
for (const [user, dbName, roles] of users) {
  const target = conn.getSiblingDB(dbName)
  if (target.getUser(user.username)) {
    print('usuario ' + user.username + ': ya existía')
  } else {
    target.createUser({ user: user.username, pwd: user.password, roles })
    print('usuario ' + user.username + ': creado en ' + dbName + ' (' + roles.map((r) => r.role + '@' + r.db).join(', ') + ')')
  }
}

// 3. Miembros que faltan (pasar de 1 a 3 nodos con datos). De a uno: un reconfig suma un solo miembro con
// voto, y cada uno tiene que terminar la sincronización inicial antes del siguiente.
const stateOf = (host) => (conn.adminCommand({ replSetGetStatus: 1 }).members.find((m) => m.name === host) || {}).stateStr
for (const host of hosts) {
  const current = conn.adminCommand({ replSetGetConfig: 1 }).config
  if (current.members.some((m) => m.host === host)) continue
  current.members.push({ _id: Math.max(...current.members.map((m) => m._id)) + 1, host, priority: 1 })
  current.version += 1
  conn.adminCommand({ replSetReconfig: current })
  print('miembro ' + host + ': agregado, sincronizando')
  for (let i = 0; i < 600 && stateOf(host) !== 'SECONDARY'; i++) sleep(1000)
  if (stateOf(host) !== 'SECONDARY') throw new Error(host + ' no llegó a SECONDARY en 10 minutos (volver a correr)')
  print('miembro ' + host + ': SECONDARY')
}

// 4. Con todos los miembros sanos, prioridades iguales: en una caída cualquiera puede ser primario.
const healthy = () => conn.adminCommand({ replSetGetStatus: 1 }).members.filter((m) => m.health === 1 && ['PRIMARY', 'SECONDARY'].includes(m.stateStr)).length
for (let i = 0; i < 120 && healthy() < hosts.length; i++) sleep(1000)
print('miembros sanos: ' + healthy() + '/' + hosts.length)
const config = conn.adminCommand({ replSetGetConfig: 1 }).config
if (config.members.some((m) => m.priority !== 1)) {
  if (healthy() < hosts.length) throw new Error('faltan miembros sanos: no se igualan las prioridades (volver a correr)')
  config.members.forEach((m) => { m.priority = 1 })
  config.version += 1
  conn.adminCommand({ replSetReconfig: config })
  print('prioridades: todas en 1')
}
if (initiated) print('listo: replica set iniciado y usuarios creados')
JS
