// users: perfil con fecha de nacimiento, barrio y localidad; y fuera users.refreshTokenHash.
//
// - Validador: suma birthDate (date), neighborhood y city (string 1–60) y interests (máx. 5).
//   `university` sigue siendo opcional. La edad NO se guarda: se calcula desde birthDate.
// - refreshTokenHash pasa a la colección `sessions` (20261011180000-create-sessions.js). El `up` lo borra
//   de los usuarios existentes; el `down` no puede restaurarlo (el valor ya no tiene sesión asociada),
//   así que quien lo revierta tiene que volver a iniciar sesión. Los datos de perfil se conservan.
// Autocontenida: no importa helpers (una migración mergeada no se edita).
const COLLECTION = 'users'

const BASE_PROPERTIES = {
  // Normalizado: sin mayúsculas ni espacios (el índice único depende de esto).
  email: { bsonType: 'string', minLength: 3, pattern: '^[^A-Z\\s]+$' },
  passwordHash: { bsonType: 'string', minLength: 1 },
  role: { enum: ['user', 'admin'] },
  status: { enum: ['active', 'suspended'] },
  reputation: { bsonType: 'number' }
}

const PREVIOUS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'status'],
    properties: {
      ...BASE_PROPERTIES,
      interests: { bsonType: 'array', items: { bsonType: 'string' } }
    }
  }
}

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'status'],
    properties: {
      ...BASE_PROPERTIES,
      interests: { bsonType: 'array', maxItems: 5, items: { bsonType: 'string' } },
      // Día del calendario guardado como Date a medianoche UTC.
      birthDate: { bsonType: 'date' },
      neighborhood: { bsonType: 'string', minLength: 1, maxLength: 60 },
      city: { bsonType: 'string', minLength: 1, maxLength: 60 }
    }
  }
}

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

export async function up (db) {
  await db.command({ collMod: COLLECTION, validator: VALIDATOR, ...OPTIONS })
  await db.collection(COLLECTION).updateMany(
    { refreshTokenHash: { $exists: true } },
    { $unset: { refreshTokenHash: '' } }
  )
}

export async function down (db) {
  await db.command({ collMod: COLLECTION, validator: PREVIOUS_VALIDATOR, ...OPTIONS })
}
