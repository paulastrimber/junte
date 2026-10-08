// plans: colección con validador ($jsonSchema + $expr) + índices de docs/arquitectura/07-modelo-de-datos.md.
// Invariante 1: 0 ≤ participantCount ≤ capacity. GeoJSON Point con coordenadas [lng, lat] en rango.
// Migración autocontenida a propósito. `down` quita índices y validador; conserva colección y datos.
const COLLECTION = 'plans'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['title', 'startsAt', 'location', 'capacity', 'participantCount', 'creatorId', 'status'],
    properties: {
      title: { bsonType: 'string', minLength: 1 },
      startsAt: { bsonType: 'date' },
      location: {
        bsonType: 'object',
        required: ['type', 'coordinates'],
        properties: {
          type: { enum: ['Point'] },
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: [
              { bsonType: 'number', minimum: -180, maximum: 180 },
              { bsonType: 'number', minimum: -90, maximum: 90 }
            ]
          }
        }
      },
      interests: { bsonType: 'array', items: { bsonType: 'string' } },
      capacity: { bsonType: 'number', minimum: 1, multipleOf: 1 },
      participantCount: { bsonType: 'number', minimum: 0, multipleOf: 1 },
      creatorId: { bsonType: 'objectId' },
      status: { enum: ['open', 'closed', 'cancelled', 'completed'] },
      checkInRadiusMeters: { bsonType: 'number', minimum: 1 }
    }
  },
  $expr: { $lte: ['$participantCount', '$capacity'] }
}

const INDEXES = [
  { key: { status: 1, startsAt: 1 }, name: 'status_startsAt' },
  { key: { location: '2dsphere' }, name: 'location_2dsphere' },
  { key: { creatorId: 1, startsAt: -1 }, name: 'creatorId_startsAt' }
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
