// Edición de catálogos desde el panel de administración (S6, ADR-0009): listar, crear y modificar filas. Nunca se
// borran (se desactivan: quien ya eligió la opción la conserva). El permiso de admin lo comprueba el servicio de admin
// antes de llamar acá. No importa Express ni Mongoose: todo llega por parámetro (DI).
import { errors } from '../../shared/errors.js'

// "Padre" de cada catálogo que depende de otro: tiene que existir al crear y no cambia después.
const PARENTS = Object.freeze({
  interests: { field: 'categoryKey', catalog: 'interest-categories', message: 'La categoría no existe' },
  careers: { field: 'universityKey', catalog: 'universities', message: 'La universidad no existe' },
  neighborhoods: { field: 'cityKey', catalog: 'cities', message: 'La ciudad no existe' }
})

// Campos que salen en la vista de administración, además de los comunes.
const EXTRA_FIELDS = Object.freeze({
  'interest-categories': [],
  interests: ['categoryKey', 'minAge'],
  universities: ['shortName'],
  careers: ['universityKey', 'group'],
  cities: ['department'],
  neighborhoods: ['cityKey', 'ineCode']
})

/**
 * Vista de una fila para el panel: lista blanca explícita, activa o no.
 * @param {string} catalog
 * @param {object} row
 */
export function serializeCatalogRow (catalog, row) {
  const extras = Object.fromEntries(EXTRA_FIELDS[catalog].map((field) => [field, row[field] ?? null]))
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    order: row.order,
    active: row.active,
    ...extras,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./catalog.repository.js').createCatalogRepository>} deps.catalogRepo
 * @param {{ invalidate: () => void }} deps.catalogService  Caché de lectura de esta instancia (las demás se renuevan en 60 s).
 */
export function createCatalogAdminService ({ catalogRepo, catalogService }) {
  return {
    /** @param {string} catalog  Ya validado. */
    async list (catalog) {
      return catalogRepo.listRows(catalog)
    },

    /**
     * @param {string} catalog
     * @param {object} data  Ya validado con CATALOG_BODIES[catalog].create.
     * @throws {import('../../shared/errors.js').AppError} VALIDATION_ERROR (padre inexistente) | CATALOG_KEY_TAKEN
     */
    async create (catalog, data) {
      const parent = PARENTS[catalog]
      if (parent && !await catalogRepo.existsKey(parent.catalog, data[parent.field])) {
        throw errors.validation([{ path: parent.field, message: parent.message }])
      }
      const row = await catalogRepo.createRow(catalog, data)
      catalogService.invalidate()
      return row
    },

    /**
     * @param {string} catalog
     * @param {string} id
     * @param {object} changes  Ya validado con CATALOG_BODIES[catalog].update; `null` quita el campo.
     * @throws {import('../../shared/errors.js').AppError} NOT_FOUND
     */
    async update (catalog, id, changes) {
      const set = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null))
      const unset = Object.entries(changes).filter(([, value]) => value === null).map(([field]) => field)
      const row = await catalogRepo.updateRow(catalog, id, { set, unset })
      if (!row) throw errors.notFound('No encontramos esa opción')
      catalogService.invalidate()
      return row
    }
  }
}
