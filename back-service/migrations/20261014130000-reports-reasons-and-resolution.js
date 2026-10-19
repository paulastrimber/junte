// reports (S6): motivos fijos, descripción de hasta 500 caracteres, `resolvedBy`/`resolvedAt` y un índice único
// parcial { reporterId, targetType, targetId } solo para los pendientes: reportar otra vez lo mismo mientras sigue
// pendiente devuelve el reporte que ya existía (nunca hay dos); una vez resuelto, se puede volver a reportar.
// No hay reportes en ningún entorno (POST /reports nace en S6), así que no hace falta backfill del motivo.
// `down` quita el índice y restaura el validador de 20261007120500-create-reports.js. Autocontenida.
const COLLECTION = 'reports'
const INDEX = {
  key: { reporterId: 1, targetType: 1, targetId: 1 },
  name: 'reporterId_targetType_targetId_pending_unique',
  unique: true,
  partialFilterExpression: { status: 'pending' }
}

const REQUIRED = ['reporterId', 'targetType', 'targetId', 'reason', 'status']

const BASE_PROPERTIES = {
  reporterId: { bsonType: 'objectId' },
  targetType: { enum: ['user', 'plan', 'message'] },
  targetId: { bsonType: 'objectId' },
  status: { enum: ['pending', 'reviewed', 'dismissed'] }
}

const PREVIOUS_PROPERTIES = {
  ...BASE_PROPERTIES,
  reason: { bsonType: 'string', minLength: 1 },
  description: { bsonType: 'string' }
}

const NEXT_PROPERTIES = {
  ...BASE_PROPERTIES,
  reason: { enum: ['spam', 'harassment', 'inappropriate', 'scam', 'other'] },
  description: { bsonType: 'string', minLength: 1, maxLength: 500 },
  resolvedBy: { bsonType: 'objectId' },
  resolvedAt: { bsonType: 'date' }
}

const validatorWith = (properties) => ({ $jsonSchema: { bsonType: 'object', required: REQUIRED, properties } })

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

function isMissing (err) {
  return err?.codeName === 'IndexNotFound' || err?.codeName === 'NamespaceNotFound'
}

export async function up (db) {
  await db.command({ collMod: COLLECTION, validator: validatorWith(NEXT_PROPERTIES), ...OPTIONS })
  await db.collection(COLLECTION).createIndexes([INDEX])
}

export async function down (db) {
  try {
    await db.collection(COLLECTION).dropIndex(INDEX.name)
  } catch (err) {
    if (!isMissing(err)) throw err
  }
  await db.command({ collMod: COLLECTION, validator: validatorWith(PREVIOUS_PROPERTIES), ...OPTIONS })
}
