// users: colección con validador $jsonSchema + índices de docs/arquitectura/07-modelo-de-datos.md.
// Las migraciones son autocontenidas a propósito (no importan helpers compartidos): una migración
// mergeada no se edita, y un helper compartido la cambiaría por la espalda.
// `down` quita índices y validador pero conserva la colección y sus datos.
const COLLECTION = 'users'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'status'],
    properties: {
      // Normalizado: sin mayúsculas ni espacios (el índice único depende de esto).
      email: { bsonType: 'string', minLength: 3, pattern: '^[^A-Z\\s]+$' },
      passwordHash: { bsonType: 'string', minLength: 1 },
      role: { enum: ['user', 'admin'] },
      status: { enum: ['active', 'suspended'] },
      reputation: { bsonType: 'number' },
      interests: { bsonType: 'array', items: { bsonType: 'string' } }
    }
  }
}

const INDEXES = [
  { key: { email: 1 }, name: 'email_unique', unique: true },
  { key: { role: 1 }, name: 'role' }
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
