// checkIns: se suma `method: 'location'` (S4, docs/tareas/s4-decisiones.md#8-check-in-y-reputación-del-creador).
// El creador inscripto registra su asistencia sin QR, solo con ubicación; el resto sigue usando 'qr-location'.
// Se mantiene `additionalProperties: false`: la ubicación del participante nunca se guarda.
// `down` restaura el validador de 20261007120300-create-check-ins.js. Autocontenida.
const COLLECTION = 'checkIns'

const validatorWith = (methods) => ({
  $jsonSchema: {
    bsonType: 'object',
    required: ['planId', 'userId', 'checkedInAt', 'method', 'distanceMeters'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      planId: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      checkedInAt: { bsonType: 'date' },
      method: { enum: methods },
      distanceMeters: { bsonType: 'number', minimum: 0 },
      accuracyMeters: { bsonType: 'number', minimum: 0 },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      __v: { bsonType: 'number' }
    }
  }
})

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

export async function up (db) {
  await db.command({ collMod: COLLECTION, validator: validatorWith(['qr-location', 'location']), ...OPTIONS })
}

export async function down (db) {
  await db.command({ collMod: COLLECTION, validator: validatorWith(['qr-location']), ...OPTIONS })
}
