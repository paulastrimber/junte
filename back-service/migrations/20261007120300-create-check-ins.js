// checkIns: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// `additionalProperties: false` garantiza en la base que nunca se guarde la ubicación del participante.
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'checkIns'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'userId', 'checkedInAt', 'method', 'distanceMeters'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      planId: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      checkedInAt: { bsonType: 'date' },
      method: { enum: ['qr-location'] },
      distanceMeters: { bsonType: 'number', minimum: 0 },
      accuracyMeters: { bsonType: 'number', minimum: 0 },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      __v: { bsonType: 'number' }
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
