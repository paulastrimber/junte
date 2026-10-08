// reports: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// { status, createdAt } sostiene la cola de moderación.
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'reports'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['reporterId', 'targetType', 'targetId', 'reason', 'status'],
    properties: {
      reporterId: { bsonType: 'objectId' },
      targetType: { enum: ['user', 'plan', 'message'] },
      targetId: { bsonType: 'objectId' },
      reason: { bsonType: 'string', minLength: 1 },
      description: { bsonType: 'string' },
      status: { enum: ['pending', 'reviewed', 'dismissed'] }
    }
  }
}

const INDEXES = [
  { key: { status: 1, createdAt: 1 }, name: 'status_createdAt' }
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
