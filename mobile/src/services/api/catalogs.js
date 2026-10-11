import { getApiClient } from './client.js'

/**
 * Catálogos para los selectores: intereses por categoría, universidades con sus carreras y ciudades con sus barrios.
 * Solo trae lo activo; la opción "Otra" no viene (la agrega la app, ver utils/catalog.js).
 * @returns {Promise<{ version: string, interestCategories: object[], universities: object[], cities: object[] }>}
 */
export async function getCatalogs ({ client = getApiClient() } = {}) {
  const { data } = await client.get('/catalogs')
  return data
}
