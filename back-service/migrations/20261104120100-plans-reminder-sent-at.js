// plans: `reminderSentAt` (S5-BE-08) en el validador $jsonSchema. Lo escribe solo el job de recordatorios, una vez
// por plan (actualización condicional), para que un reinicio o una segunda instancia no repitan el aviso; cambiar
// `startsAt` lo borra. Sin backfill: sin valor = recordatorio pendiente (los planes que ya empezaron no se recuerdan).
// No hace falta índice: el job busca por { status, startsAt } (índice status_startsAt).
// `down` restaura el validador de 20261013120100. Autocontenida: no se edita una vez mergeada.
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
    required: [...S3_REQUIRED, 'checkInOpensAt', 'checkInClosesAt', 'checkInRadiusMeters'],
    properties: {
      ...S3_PROPERTIES,
      checkInOpensAt: { bsonType: 'date' },
      checkInClosesAt: { bsonType: 'date' },
      checkInRadiusMeters: { bsonType: 'number', minimum: 50, maximum: 1000 },
      qrNonceHash: { bsonType: 'string' },
      qrExpiresAt: { bsonType: 'date' },
      qrPreviousNonceHash: { bsonType: 'string' },
      qrPreviousExpiresAt: { bsonType: 'date' },
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

// Igual al anterior + `reminderSentAt`.
const VALIDATOR = {
  ...PREVIOUS_VALIDATOR,
  $jsonSchema: {
    ...PREVIOUS_VALIDATOR.$jsonSchema,
    properties: { ...PREVIOUS_VALIDATOR.$jsonSchema.properties, reminderSentAt: { bsonType: 'date' } }
  }
}

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

export async function up (db) {
  await db.command({ collMod: COLLECTION, validator: VALIDATOR, ...OPTIONS })
}

export async function down (db) {
  await db.command({ collMod: COLLECTION, validator: PREVIOUS_VALIDATOR, ...OPTIONS })
}
