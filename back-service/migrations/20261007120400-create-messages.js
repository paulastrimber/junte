// messages: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// { planId, createdAt: -1, _id: -1 } sostiene la paginación estable del chat por cursor.
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'messages'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'senderId', 'text', 'status'],
    properties: {
      planId: { bsonType: 'objectId' },
      senderId: { bsonType: 'objectId' },
      text: { bsonType: 'string', minLength: 1, maxLength: 2000 },
      status: { enum: ['visible', 'hidden'] }
    }
  }
}

const INDEXES = [
  { key: { planId: 1, createdAt: -1, _id: -1 }, name: 'planId_createdAt_id' }
]

async function collectionExists (db, name) {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray()
  return found.length > 0
}

function isMissing (err) {
  return err?.codeName === 'IndexNotFound' || err?.codeName === 'NamespaceNotFound'
}

export async function up (db) {
  const options = { validator: VALIDATOR, validationLevel: 'moderate', validationAction: 'error' }
  if (await collectionExists(db, COLLECTION)) {
    await db.command({ collMod: COLLECTION, ...options })
  } else {
    await db.createCollection(COLLECTION, options)
  }
  await db.collection(COLLECTION).createIndexes(INDEXES)
}

export async function down (db) {
  for (const { name } of INDEXES) {
    try {
      await db.collection(COLLECTION).dropIndex(name)
    } catch (err) {
      if (!isMissing(err)) throw err
    }
  }
  try {
    await db.command({ collMod: COLLECTION, validator: {}, validationLevel: 'strict', validationAction: 'error' })
  } catch (err) {
    if (!isMissing(err)) throw err
  }
}
