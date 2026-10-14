// messages: `type` y `clientId` opcionales (S5) + índice único parcial
// { senderId, clientId }. Un reintento de `chat:send` o de `POST /plans/:id/messages` con el mismo `clientId` del mismo
// remitente choca con el índice y el back devuelve el mensaje ya creado: nunca hay dos.
// Parcial (solo documentos con `clientId` string): los mensajes sin `clientId` no compiten entre sí.
// `type` nace solo con 'text' (sin `type` cuenta como texto): las notas de voz suman 'voice' + `audioKey` en otra
// migración, sin backfill.
// `down` quita el índice y restaura el validador de 20261007120400-create-messages.js. Autocontenida.
const COLLECTION = 'messages'
const INDEX = {
  key: { senderId: 1, clientId: 1 },
  name: 'senderId_clientId_unique',
  unique: true,
  partialFilterExpression: { clientId: { $type: 'string' } }
}

const BASE_PROPERTIES = {
  planId: { bsonType: 'objectId' },
  senderId: { bsonType: 'objectId' },
  text: { bsonType: 'string', minLength: 1, maxLength: 2000 },
  status: { enum: ['visible', 'hidden'] }
}

const validatorWith = (properties) => ({
  $jsonSchema: { bsonType: 'object', required: ['planId', 'senderId', 'text', 'status'], properties }
})

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

function isMissing (err) {
  return err?.codeName === 'IndexNotFound' || err?.codeName === 'NamespaceNotFound'
}

export async function up (db) {
  const clientId = { bsonType: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }
  const type = { enum: ['text'] }
  await db.command({ collMod: COLLECTION, validator: validatorWith({ ...BASE_PROPERTIES, type, clientId }), ...OPTIONS })
  await db.collection(COLLECTION).createIndexes([INDEX])
}

export async function down (db) {
  try {
    await db.collection(COLLECTION).dropIndex(INDEX.name)
  } catch (err) {
    if (!isMissing(err)) throw err
  }
  await db.command({ collMod: COLLECTION, validator: validatorWith(BASE_PROPERTIES), ...OPTIONS })
}
