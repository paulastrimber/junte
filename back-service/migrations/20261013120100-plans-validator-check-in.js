// plans: validador $jsonSchema con las reglas de S4 (defensa en profundidad; Zod y el servicio son la primera barrera).
// - `checkInOpensAt`, `checkInClosesAt` y `checkInRadiusMeters` pasan a ser obligatorios (backfill en 20261013120000).
// - `checkInRadiusMeters`: de 50 a 1000 m. La ventana abre antes de cerrar y nunca cierra después de `endsAt`.
// - `qrNonceHash` y `qrExpiresAt`: desafío QR vigente (hash del nonce y vencimiento).
// - `attendanceClosedAt`: cuándo el job cerró la asistencia del plan (marca noShow una sola vez).
// El resto es igual al validador de S3. `down` restaura el de 20261012120100. Autocontenida: no se edita una vez mergeada.
const COLLECTION = 'plans'
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const KEY_PATTERN = '^([a-z0-9]+(-[a-z0-9]+)*)$'

const coordinates = {
  bsonType: 'array',
  minItems: 2,
  maxItems: 2,
  items: [
    { bsonType: 'number', minimum: -180, maximum: 180 },
    { bsonType: 'number', minimum: -90, maximum: 90 }
  ]
}

const S3_REQUIRED = ['title', 'startsAt', 'endsAt', 'location', 'interests', 'capacity', 'price', 'participantCount', 'creatorId', 'status']

const S3_PROPERTIES = {
  title: { bsonType: 'string', minLength: 3, maxLength: 100 },
  description: { bsonType: 'string', maxLength: 2000 },
  startsAt: { bsonType: 'date' },
  endsAt: { bsonType: 'date' },
  location: {
    bsonType: 'object',
    required: ['label', 'type', 'coordinates'],
    properties: {
      label: { bsonType: 'string', minLength: 1, maxLength: 120 },
      type: { enum: ['Point'] },
      coordinates
    }
  },
  interests: {
    bsonType: 'array',
    minItems: 1,
    maxItems: 10,
    items: { bsonType: 'string', pattern: KEY_PATTERN, maxLength: 80 }
  },
  capacity: { anyOf: [{ bsonType: 'null' }, { bsonType: 'number', minimum: 1, maximum: 500, multipleOf: 1 }] },
  price: { bsonType: 'number', minimum: 0, maximum: 100000, multipleOf: 1 },
  participantCount: { bsonType: 'number', minimum: 0, multipleOf: 1 },
  creatorId: { bsonType: 'objectId' },
  status: { enum: ['open', 'closed', 'cancelled', 'completed'] }
}

const S3_EXPR = [
  // `$lte` contra null también cubre el campo ausente: sin cupo definido no hay tope.
  { $or: [{ $lte: ['$capacity', null] }, { $lte: ['$participantCount', '$capacity'] }] },
  { $gt: ['$endsAt', '$startsAt'] },
  { $lte: [{ $subtract: ['$endsAt', '$startsAt'] }, MAX_DURATION_MS] }
]

const PREVIOUS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: S3_REQUIRED,
    properties: { ...S3_PROPERTIES, checkInRadiusMeters: { bsonType: 'number', minimum: 1 } }
  },
  $expr: { $and: S3_EXPR }
}

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: [...S3_REQUIRED, 'checkInOpensAt', 'checkInClosesAt', 'checkInRadiusMeters'],
    properties: {
      ...S3_PROPERTIES,
      checkInOpensAt: { bsonType: 'date' },
      checkInClosesAt: { bsonType: 'date' },
      checkInRadiusMeters: { bsonType: 'number', minimum: 50, maximum: 1000 },
      qrNonceHash: { bsonType: 'string' },
      qrExpiresAt: { bsonType: 'date' },
      attendanceClosedAt: { bsonType: 'date' }
    }
  },
  $expr: {
    $and: [
      ...S3_EXPR,
      { $gt: ['$checkInClosesAt', '$checkInOpensAt'] },
      { $lte: ['$checkInClosesAt', '$endsAt'] }
    ]
  }
}

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

export async function up (db) {
  await db.command({ collMod: COLLECTION, validator: VALIDATOR, ...OPTIONS })
}

export async function down (db) {
  await db.command({ collMod: COLLECTION, validator: PREVIOUS_VALIDATOR, ...OPTIONS })
}
