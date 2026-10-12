// plans: `endsAt` pasa a ser obligatorio (S3: el feed lo usa para la compatibilidad horaria y el detalle lo muestra).
// Los planes que ya existían (datos de desarrollo) no lo tienen: se completa con `startsAt + 2 h`, una duración
// razonable para los planes de ejemplo. Va antes del validador nuevo (20261012120100), que lo exige.
// `down` lo quita de todos los planes: el código anterior no conoce el campo. Autocontenida (no importa helpers).
const COLLECTION = 'plans'
const BACKFILL_DURATION_MS = 2 * 60 * 60 * 1000

export async function up (db) {
  await db.collection(COLLECTION).updateMany(
    { endsAt: { $exists: false }, startsAt: { $type: 'date' } },
    [{ $set: { endsAt: { $add: ['$startsAt', BACKFILL_DURATION_MS] } } }]
  )
}

export async function down (db) {
  await db.collection(COLLECTION).updateMany({ endsAt: { $exists: true } }, { $unset: { endsAt: '' } })
}
