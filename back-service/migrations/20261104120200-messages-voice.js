// messages: notas de voz (S5-BE-09, docs/pendientes.md#notas-de-voz-y-contactos). `type` admite 'voice'; una nota de
// voz lleva `audioKey` (clave en S3, bajo messages/<planId>/<userId>/) y `durationMs` (1 a 60000) y no lleva `text`.
// Un mensaje de texto (o sin `type`, anteriores a S5) sigue exigiendo `text`. Sin backfill.
// `down` restaura el validador de 20261014120000-messages-client-id.js (falla si ya hay notas de voz guardadas con
// validationLevel moderate solo al modificarlas). Autocontenida: no se edita una vez mergeada.
const COLLECTION = 'messages'

const CLIENT_ID = { bsonType: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }
const TEXT = { bsonType: 'string', minLength: 1, maxLength: 2000 }

const COMMON = {
  planId: { bsonType: 'objectId' },
  senderId: { bsonType: 'objectId' },
  status: { enum: ['visible', 'hidden'] },
  clientId: CLIENT_ID
}

const PREVIOUS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'senderId', 'text', 'status'],
    properties: { ...COMMON, text: TEXT, type: { enum: ['text'] } }
  }
}

const NO_AUDIO = { anyOf: [{ required: ['audioKey'] }, { required: ['durationMs'] }] }

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'senderId', 'status'],
    properties: {
      ...COMMON,
      type: { enum: ['text', 'voice'] },
      text: TEXT,
      audioKey: { bsonType: 'string', pattern: '^messages/[0-9a-f]{24}/[0-9a-f]{24}/[A-Za-z0-9-]{1,64}\\.m4a$' },
      durationMs: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 60000 }
    },
    oneOf: [
      // Texto (sin `type` también es texto): con texto y sin audio.
      { properties: { type: { enum: ['text'] } }, required: ['type', 'text'], not: NO_AUDIO },
      { not: { anyOf: [{ required: ['type'] }, NO_AUDIO.anyOf[0], NO_AUDIO.anyOf[1]] }, required: ['text'] },
      // Nota de voz: con audio y duración, sin texto.
      { properties: { type: { enum: ['voice'] } }, required: ['type', 'audioKey', 'durationMs'], not: { required: ['text'] } }
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
