// planParticipants: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// El índice único { planId, userId } es lo que convierte una doble inscripción en E11000 (ALREADY_JOINED).
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'planParticipants'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'userId', 'status', 'joinedAt', 'noShow'],
    properties: {
      planId: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      status: { enum: ['active', 'cancelled'] },
      joinedAt: { bsonType: 'date' },
      cancelledAt: { bsonType: 'date' },
      noShow: { bsonType: 'bool' },
      noShowAt: { bsonType: 'date' }
    }
  }
}

const INDEXES = [
  { key: { planId: 1, userId: 1 }, name: 'planId_userId_unique', unique: true },
  { key: { userId: 1, status: 1 }, name: 'userId_status' }
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
