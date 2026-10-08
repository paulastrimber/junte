// deviceTokens: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// Un registro por token FCM (único) y búsqueda por usuario para enviar push.
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'deviceTokens'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'token', 'platform'],
    properties: {
      userId: { bsonType: 'objectId' },
      token: { bsonType: 'string', minLength: 1 },
      platform: { enum: ['android', 'ios'] }
    }
  }
}

const INDEXES = [
  { key: { token: 1 }, name: 'token_unique', unique: true },
  { key: { userId: 1 }, name: 'userId' }
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
