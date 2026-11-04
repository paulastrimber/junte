// spotAlerts (S5-BE-10): "avisame si se libera un lugar". Colección con validador $jsonSchema + índice único
// { planId, userId }: un pedido por persona y plan (pedirlo dos veces deja uno). Se busca por `planId` (prefijo del
// índice) para avisar a todos los que lo pidieron.
// Migración autocontenida. `down` quita el índice y el validador; conserva colección y datos.
const COLLECTION = 'spotAlerts'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'userId', 'createdAt'],
    properties: {
      planId: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' }
    }
  }
}

const INDEXES = [
  { key: { planId: 1, userId: 1 }, name: 'planId_userId_unique', unique: true }
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
