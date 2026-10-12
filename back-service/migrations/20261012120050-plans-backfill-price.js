// plans: `price` (costo del plan en pesos uruguayos, entero; 0 = gratis). Los planes que ya existían quedan gratis.
// Va antes del validador nuevo (20261012120100), que lo exige. `down` quita el campo: el código anterior no lo conoce.
// Autocontenida (no importa helpers).
const COLLECTION = 'plans'

export async function up (db) {
  await db.collection(COLLECTION).updateMany({ price: { $exists: false } }, { $set: { price: 0 } })
}

export async function down (db) {
  await db.collection(COLLECTION).updateMany({ price: { $exists: true } }, { $unset: { price: '' } })
}
