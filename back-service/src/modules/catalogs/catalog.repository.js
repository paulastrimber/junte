// Lee los catálogos completos (son chicos: unas 400 filas en total). Devuelve objetos planos, ya ordenados.

const plain = (doc) => ({ ...doc, id: String(doc._id), _id: undefined, __v: undefined })

/**
 * @param {{ InterestCategory, Interest, University, Career, City, Neighborhood }} models
 */
export function createCatalogRepository ({ InterestCategory, Interest, University, Career, City, Neighborhood }) {
  const load = async (Model, sort) => (await Model.find({}).sort(sort).lean()).map(plain)

  return {
    /**
     * Todo el contenido, activo o no (las reglas necesitan ver también lo desactivado).
     * @returns {Promise<{ interestCategories: object[], interests: object[], universities: object[], careers: object[], cities: object[], neighborhoods: object[] }>}
     */
    async loadAll () {
      const [interestCategories, interests, universities, careers, cities, neighborhoods] = await Promise.all([
        load(InterestCategory, { order: 1, key: 1 }),
        load(Interest, { categoryKey: 1, order: 1, key: 1 }),
        load(University, { order: 1, key: 1 }),
        load(Career, { universityKey: 1, group: 1, name: 1 }),
        load(City, { order: 1, key: 1 }),
        load(Neighborhood, { cityKey: 1, name: 1 })
      ])
      return { interestCategories, interests, universities, careers, cities, neighborhoods }
    }
  }
}
