// sessions: una por dispositivo/login (docs/arquitectura/adr/0008-sesiones-multiples.md).
// Reemplaza a users.refreshTokenHash, que permitía una sola sesión por usuario.
// Autocontenida (no importa helpers): una migración mergeada no se edita.
// `down` quita índices y validador pero conserva la colección y sus datos.
const COLLECTION = 'sessions'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'sid', 'refreshTokenHash', 'lastUsedAt', 'expiresAt'],
    properties: {
      userId: { bsonType: 'objectId' },
      sid: { bsonType: 'string', minLength: 1 },
      // sha256 en hex del refresh token vigente de la sesión (nunca el token).
      refreshTokenHash: { bsonType: 'string', minLength: 1 },
      deviceLabel: { bsonType: 'string', maxLength: 60 },
      lastUsedAt: { bsonType: 'date' },
      expiresAt: { bsonType: 'date' },
      revokedAt: { bsonType: 'date' }
    }
  }
}

const INDEXES = [
  { key: { sid: 1 }, name: 'sid_unique', unique: true },
  { key: { userId: 1 }, name: 'userId' },
  // TTL: MongoDB borra la sesión cuando llega expiresAt (el job corre cada ~60 s).
  { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 }
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
