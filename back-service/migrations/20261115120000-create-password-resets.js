// passwordResets: recuperación de contraseña con un código de 6 dígitos que llega por email.
// Un documento por usuario (índice único `userId`): pedir otro código reemplaza al anterior. Guarda solo el HMAC del
// código (nunca el código), cuándo vence, cuántos intentos fallidos lleva y cuántos códigos se pidieron en la ventana
// (para limitar los pedidos por cuenta). El índice TTL borra el documento cuando termina la ventana; la vigencia del
// código se comprueba siempre en la consulta (`expiresAt`), nunca se confía en el TTL (corre cada ~60 s).
// Migración autocontenida. `down` quita los índices y el validador; conserva la colección y sus datos.
const COLLECTION = 'passwordResets'

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['userId', 'codeHash', 'expiresAt', 'attempts', 'requestCount', 'lastSentAt', 'windowEndsAt'],
    properties: {
      userId: { bsonType: 'objectId' },
      // HMAC-SHA256 en hex del código (con el secreto del back): un volcado de la base no alcanza para conocerlo.
      codeHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      expiresAt: { bsonType: 'date' },
      attempts: { bsonType: 'number', minimum: 0 },
      requestCount: { bsonType: 'number', minimum: 1 },
      lastSentAt: { bsonType: 'date' },
      windowEndsAt: { bsonType: 'date' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' }
    }
  }
}

const INDEXES = [
  { key: { userId: 1 }, name: 'userId_unique', unique: true },
  // TTL: MongoDB borra el documento cuando termina la ventana de pedidos.
  { key: { windowEndsAt: 1 }, name: 'windowEndsAt_ttl', expireAfterSeconds: 0 }
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
