// plans: parámetros del check-in (S4, docs/tareas/s4-decisiones.md#5-parámetros-del-check-in).
// Los planes creados antes de S4 no los tienen: se completan con los valores por defecto, que son los mismos que
// calcula el back al crear un plan (ventana `startsAt − 15 min` a `min(startsAt + 60 min, endsAt)`, radio 150 m).
// Va antes del validador nuevo (20261013120100), que los exige.
// `down` quita la ventana (se deriva de las fechas); el radio se conserva. Autocontenida (no importa helpers).
const COLLECTION = 'plans'
const OPENS_BEFORE_START_MS = 15 * 60 * 1000
const CLOSES_AFTER_START_MS = 60 * 60 * 1000
const DEFAULT_RADIUS_METERS = 150

export async function up (db) {
  const plans = db.collection(COLLECTION)
  await plans.updateMany(
    { startsAt: { $type: 'date' }, endsAt: { $type: 'date' } },
    [{
      $set: {
        checkInOpensAt: { $subtract: ['$startsAt', OPENS_BEFORE_START_MS] },
        checkInClosesAt: { $min: [{ $add: ['$startsAt', CLOSES_AFTER_START_MS] }, '$endsAt'] }
      }
    }]
  )
  // Un radio fuera del rango nuevo (50 a 1000 m) también pasa al valor por defecto.
  await plans.updateMany(
    { $or: [{ checkInRadiusMeters: { $exists: false } }, { checkInRadiusMeters: { $not: { $gte: 50, $lte: 1000 } } }] },
    { $set: { checkInRadiusMeters: DEFAULT_RADIUS_METERS } }
  )
}

export async function down (db) {
  await db.collection(COLLECTION).updateMany({}, { $unset: { checkInOpensAt: '', checkInClosesAt: '' } })
}
