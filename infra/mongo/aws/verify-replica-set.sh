#!/bin/bash
# Verificaciones del paso 1.6: miembros del replica set, sin usuario no se entra, junte_app solo llega a su
# base, transacciones. Corre por Session Manager en un nodo (lo manda `task aws:mongo-init`).
# Entorno: ENV_NAME, REGION, HOSTS. Solo lectura, salvo una colección de prueba que se borra al final.
set -euo pipefail
: "${ENV_NAME:?}" "${REGION:?}" "${HOSTS:?}"

get () { aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/$1" --query SecretString --output text; }
ADMIN_JSON=$(get mongo-admin)
APP_JSON=$(get mongo-app)
export ADMIN_JSON APP_JSON HOSTS

docker exec -i -e ADMIN_JSON -e APP_JSON -e HOSTS mongo mongosh --quiet --nodb <<'JS'
const url = (dbName) => 'mongodb://' + process.env.HOSTS + '/' + dbName + '?replicaSet=rs0'
const admin = JSON.parse(process.env.ADMIN_JSON)
const app = JSON.parse(process.env.APP_JSON)

const adminDb = connect(url('admin'))
adminDb.auth(admin.username, admin.password)
const status = adminDb.adminCommand({ replSetGetStatus: 1 })
print('1. ' + status.set + ': ' + status.members.length + ' miembro(s)')
status.members.forEach((m) => print('   ' + m.name + ' ' + m.stateStr + ' health=' + m.health + ' prioridad=' +
  adminDb.adminCommand({ replSetGetConfig: 1 }).config.members.find((c) => c.host === m.name).priority))

const anonymous = connect(url('admin'))
try { anonymous.adminCommand({ listDatabases: 1 }); print('2. sin usuario: SE PUDO LISTAR (mal)') } catch (e) { print('2. sin usuario: ' + e.codeName) }

const db = connect(url('junte'))
db.auth(app.username, app.password)
const inserted = db.verificacion.insertOne({ t: new Date() })
db.verificacion.deleteOne({ _id: inserted.insertedId })
print('3. junte_app escribe y borra en junte: ok')
try { db.getSiblingDB('otra').x.insertOne({ a: 1 }); print('   escribe en otra base: SÍ (mal)') } catch (e) { print('   escribe en otra base: ' + e.codeName) }
try { db.getSiblingDB('admin').getUsers(); print('   lee usuarios de admin: SÍ (mal)') } catch (e) { print('   lee usuarios de admin: ' + e.codeName) }

const session = db.getMongo().startSession()
const collection = session.getDatabase('junte').verificacion
session.startTransaction(); collection.insertOne({ tx: 1 }); collection.insertOne({ tx: 2 }); session.commitTransaction()
print('4. transacción con commit: ' + db.verificacion.countDocuments({ tx: { $in: [1, 2] } }) + ' documentos')
session.startTransaction(); collection.insertOne({ tx: 3 }); session.abortTransaction()
print('   transacción con abort: ' + db.verificacion.countDocuments({ tx: 3 }) + ' documentos')
db.verificacion.drop()
JS
