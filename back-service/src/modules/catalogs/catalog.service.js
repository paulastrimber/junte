// Catálogos: lectura con caché corta y reglas. El back no tiene estado local que importe: la caché es solo una copia
// de lectura de datos de referencia; cada instancia la renueva sola cada `ttlMs`, así que un cambio del admin se ve
// en todas en menos de ese tiempo (sin Redis ni invalidación entre instancias).
import { buildPublicCatalog, checkInterestReferences, checkProfileReferences } from './catalog.rules.js'

export const CATALOG_TTL_MS = 60_000

/**
 * @param {object} deps
 * @param {ReturnType<import('./catalog.repository.js').createCatalogRepository>} deps.catalogRepo
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {number} [deps.ttlMs]
 */
export function createCatalogService ({ catalogRepo, clock, ttlMs = CATALOG_TTL_MS }) {
  let cached = null // { snapshot, loadedAt }
  let loading = null

  async function getSnapshot () {
    const now = clock.now().getTime()
    if (cached && now - cached.loadedAt < ttlMs) return cached.snapshot

    // Lecturas simultáneas con la caché vencida comparten una sola consulta.
    loading ??= catalogRepo.loadAll()
      .then((snapshot) => { cached = { snapshot, loadedAt: clock.now().getTime() }; return snapshot })
      .finally(() => { loading = null })
    return loading
  }

  return {
    getSnapshot,

    /** Vista para la app: solo lo activo, anidado y con `version`. */
    async getPublicCatalog () {
      return buildPublicCatalog(await getSnapshot())
    },

    /** @returns {Promise<Array<{ path: string, message: string }>>} problemas del perfil resultante (vacío si es válido). */
    async checkProfileReferences (params) {
      return checkProfileReferences(await getSnapshot(), params)
    },

    /**
     * Intereses de un plan (los elige su creador): existen, están disponibles y la edad del creador alcanza.
     * @param {{ keys: string[], kept?: string[], age: number | null }} params
     * @returns {Promise<Array<{ path: string, message: string }>>}
     */
    async checkInterests (params) {
      return checkInterestReferences(await getSnapshot(), params)
    },

    /** Descarta la caché (lo usa el admin al editar, en la misma instancia). */
    invalidate () {
      cached = null
    }
  }
}
