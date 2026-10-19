// Lee los catálogos completos (son chicos: unas 400 filas en total). Devuelve objetos planos, ya ordenados.
// Desde S6 también los edita (solo el panel de administración): crear y modificar filas, nunca borrarlas.
import mongoose from 'mongoose'
import { AppError } from '../../shared/errors.js'

const DUPLICATE_KEY = 11000

const plain = (doc) => ({ ...doc, id: String(doc._id), _id: undefined, __v: undefined })

/**
 * @param {{ InterestCategory, Interest, University, Career, City, Neighborhood }} models
 */
export function createCatalogRepository ({ InterestCategory, Interest, University, Career, City, Neighborhood }) {
  const load = async (Model, sort) => (await Model.find({}).sort(sort).lean()).map(plain)

  // Catálogo (como lo nombra la API de administración) → modelo y orden de lectura.
  const BY_CATALOG = {
    'interest-categories': { Model: InterestCategory, sort: { order: 1, key: 1 } },
    interests: { Model: Interest, sort: { categoryKey: 1, order: 1, key: 1 } },
    universities: { Model: University, sort: { order: 1, key: 1 } },
    careers: { Model: Career, sort: { universityKey: 1, group: 1, name: 1 } },
    cities: { Model: City, sort: { order: 1, key: 1 } },
    neighborhoods: { Model: Neighborhood, sort: { cityKey: 1, name: 1 } }
  }

  const keyTaken = () => new AppError('CATALOG_KEY_TAKEN', 'Ya existe una opción con esa key')

  return {
    /**
     * Todo el contenido, activo o no (las reglas necesitan ver también lo desactivado).
     * @returns {Promise<{ interestCategories: object[], interests: object[], universities: object[], careers: object[], cities: object[], neighborhoods: object[] }>}
     */
    async loadAll () {
      const [interestCategories, interests, universities, careers, cities, neighborhoods] = await Promise.all(
        ['interest-categories', 'interests', 'universities', 'careers', 'cities', 'neighborhoods']
          .map((catalog) => load(BY_CATALOG[catalog].Model, BY_CATALOG[catalog].sort))
      )
      return { interestCategories, interests, universities, careers, cities, neighborhoods }
    },

    /**
     * Las filas de un catálogo, activas o no, en el orden de lectura.
     * @param {string} catalog  Ya validado (una de las keys de BY_CATALOG).
     * @returns {Promise<object[]>}
     */
    async listRows (catalog) {
      const { Model, sort } = BY_CATALOG[catalog]
      return load(Model, sort)
    },

    /** @returns {Promise<boolean>} true si existe una fila con esa key (activa o no). */
    async existsKey (catalog, key) {
      if (typeof key !== 'string') return false
      return (await BY_CATALOG[catalog].Model.exists({ key })) !== null
    },

    /**
     * @param {string} catalog
     * @param {object} data  Campos ya validados.
     * @returns {Promise<object>}
     * @throws {AppError} CATALOG_KEY_TAKEN
     */
    async createRow (catalog, data) {
      try {
        const doc = await BY_CATALOG[catalog].Model.create(data)
        return plain(doc.toObject())
      } catch (err) {
        if (err?.code === DUPLICATE_KEY) throw keyTaken()
        throw err
      }
    },

    /**
     * @param {string} catalog
     * @param {string} id
     * @param {{ set: object, unset: string[] }} changes  Campos ya validados (nunca la key ni el "padre").
     * @returns {Promise<object | null>} null si no existe.
     */
    async updateRow (catalog, id, { set, unset }) {
      if (!mongoose.isValidObjectId(id)) return null
      const update = {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((field) => [field, ''])) } : {})
      }
      const doc = await BY_CATALOG[catalog].Model.findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? plain(doc) : null
    }
  }
}
