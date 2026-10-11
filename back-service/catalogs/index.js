// Datos iniciales de los catálogos y su carga. `syncCatalogs` SOLO INSERTA lo que falta (por key): nunca pisa
// lo que el admin editó (nombre, orden, activo) ni borra nada. Es idempotente: se puede correr N veces.
// Lo corre la migración 20261011190100-seed-catalogs (así queda cargado en todo entorno, producción incluida)
// y `npm run catalogs:sync` para sumar entradas nuevas a una base existente.
import { CAREERS } from './careers.js'
import { CITIES, NEIGHBORHOODS } from './geography.js'
import { INTEREST_CATEGORIES, INTERESTS } from './interests.js'
import { UNIVERSITIES } from './universities.js'

/** Documentos iniciales por colección, con su filtro de unicidad. Puro: sin acceso a la base. */
export function buildCatalogDocuments () {
  const withOrder = (items) => items.map((item, index) => ({ ...item, order: index + 1, active: true }))
  const scoped = (byParent, parentField) => Object.entries(byParent)
    .flatMap(([parentKey, items]) => withOrder(items).map((item) => ({ ...item, [parentField]: parentKey })))

  return [
    { collection: 'interestCategories', unique: ['key'], docs: withOrder(INTEREST_CATEGORIES) },
    { collection: 'interests', unique: ['key'], docs: scoped(INTERESTS, 'categoryKey') },
    { collection: 'universities', unique: ['key'], docs: withOrder(UNIVERSITIES) },
    { collection: 'careers', unique: ['universityKey', 'key'], docs: scoped(CAREERS, 'universityKey') },
    { collection: 'cities', unique: ['key'], docs: withOrder(CITIES) },
    { collection: 'neighborhoods', unique: ['cityKey', 'key'], docs: scoped(NEIGHBORHOODS, 'cityKey') }
  ]
}

/**
 * Inserta lo que falta. Usa el driver nativo (`db` de mongodb): las migraciones no pasan por Mongoose.
 * @param {import('mongodb').Db} db
 * @param {{ now?: Date }} [options]
 * @returns {Promise<Record<string, number>>} colección → documentos insertados en esta corrida.
 */
export async function syncCatalogs (db, { now = new Date() } = {}) {
  const inserted = {}
  for (const { collection, unique, docs } of buildCatalogDocuments()) {
    const result = await db.collection(collection).bulkWrite(docs.map((doc) => ({
      updateOne: {
        filter: Object.fromEntries(unique.map((field) => [field, doc[field]])),
        update: { $setOnInsert: { ...doc, createdAt: now, updatedAt: now } },
        upsert: true
      }
    })), { ordered: false })
    inserted[collection] = result.upsertedCount
  }
  return inserted
}
