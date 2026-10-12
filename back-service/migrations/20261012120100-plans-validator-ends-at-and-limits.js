// plans: validador $jsonSchema con las reglas de S3 (defensa en profundidad; Zod es la primera barrera).
// - `endsAt` obligatorio, posterior a `startsAt` y como máximo 7 días después.
// - Límites de texto: título 3–100, descripción hasta 2000, nombre del lugar (`location.label`) obligatorio 1–120.
// - `price`: entero de 0 (gratis) a 100000, en pesos uruguayos. Obligatorio (backfill en 20261012120050).
// - `interests`: de 1 a 10 keys del catálogo (minúsculas, números y guiones).
// - `capacity`: entero de 1 a 500, o `null` = cupo ilimitado (el campo sigue siendo obligatorio: null explícito).
// - Se mantiene el invariante 1 (0 ≤ participantCount ≤ capacity) cuando hay cupo; sin límite solo aplica el ≥ 0.
// `down` restaura el validador de 20261007120100-create-plans.js. Autocontenida: una migración mergeada no se edita.
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

const PREVIOUS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['title', 'startsAt', 'location', 'capacity', 'participantCount', 'creatorId', 'status'],
    properties: {
      title: { bsonType: 'string', minLength: 1 },
      startsAt: { bsonType: 'date' },
      location: {
        bsonType: 'object',
        required: ['type', 'coordinates'],
        properties: { type: { enum: ['Point'] }, coordinates }
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

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['title', 'startsAt', 'endsAt', 'location', 'interests', 'capacity', 'price', 'participantCount', 'creatorId', 'status'],
    properties: {
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
      status: { enum: ['open', 'closed', 'cancelled', 'completed'] },
      checkInRadiusMeters: { bsonType: 'number', minimum: 1 }
    }
  },
  $expr: {
    $and: [
      // `$lte` contra null también cubre el campo ausente: sin cupo definido no hay tope.
      { $or: [{ $lte: ['$capacity', null] }, { $lte: ['$participantCount', '$capacity'] }] },
      { $gt: ['$endsAt', '$startsAt'] },
      { $lte: [{ $subtract: ['$endsAt', '$startsAt'] }, MAX_DURATION_MS] }
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
