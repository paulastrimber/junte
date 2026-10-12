// Acceso a la colección `plans`. Regla 8: las queries se arman acá a partir de filtros ya validados y predefinidos;
// nunca llega a MongoDB un operador ni un campo elegido por el cliente.
import mongoose from 'mongoose'
import { AVAILABILITY, EDITABLE_STATUSES, PRICE_RANGES } from './plan.rules.js'

/**
 * @typedef {object} PlanEntity
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {Date} startsAt
 * @property {Date} endsAt
 * @property {{ label: string, type: 'Point', coordinates: [number, number] }} location  `[lng, lat]`.
 * @property {string[]} interests
 * @property {string} [university]
 * @property {number | null} capacity  null = cupo ilimitado.
 * @property {number} price
 * @property {number} participantCount
 * @property {string} creatorId
 * @property {'open' | 'closed' | 'cancelled' | 'completed'} status
 * @property {string} [photoKey]
 * @property {Date} createdAt
 * @property {number} [distanceMeters]  Solo en los resultados de `findNearby`.
 */

/**
 * Filtros predefinidos de los listados (ya validados por Zod).
 * @typedef {object} PlanFilters
 * @property {Date} [from]  `startsAt` desde.
 * @property {Date} [to]  `startsAt` hasta.
 * @property {string} [university]
 * @property {string[]} [interests]  El plan tiene al menos uno.
 * @property {'available' | 'full'} [availability]  Con cupo (por defecto) o llenos.
 * @property {string[]} [priceRanges]  Keys de PRICE_RANGES; el precio cae en alguno.
 */

/** @returns {PlanEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    location: { label: doc.location.label, type: 'Point', coordinates: [...doc.location.coordinates] },
    interests: doc.interests ?? [],
    university: doc.university,
    capacity: doc.capacity ?? null,
    price: doc.price ?? 0,
    participantCount: doc.participantCount ?? 0,
    creatorId: String(doc.creatorId),
    status: doc.status,
    photoKey: doc.photoKey,
    createdAt: doc.createdAt,
    ...(doc.distanceMeters !== undefined ? { distanceMeters: doc.distanceMeters } : {})
  }
}

const EDITABLE_FIELDS = ['title', 'description', 'startsAt', 'endsAt', 'location', 'interests', 'capacity', 'price']

const onlyStrings = (values) => (Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [])

function priceClause (keys) {
  const ranges = PRICE_RANGES.filter((range) => keys.includes(range.key))
  if (ranges.length === 0) return null
  return { $or: ranges.map(({ min, max }) => ({ price: max === null ? { $gte: min } : { $gte: min, $lte: max } })) }
}

/**
 * Condiciones comunes de los listados: planes abiertos que todavía no empezaron, más los filtros predefinidos.
 * @param {PlanFilters} filters
 * @param {{ startsAfter: Date, createdUntil?: Date }} window
 * @returns {object[]} cláusulas para un `$and`.
 */
function listClauses (filters, { startsAfter, createdUntil }) {
  const { from, to, university, availability = AVAILABILITY.AVAILABLE } = filters
  const interests = onlyStrings(filters.interests)
  const clauses = [{ status: 'open' }, { startsAt: { $gt: startsAfter } }]

  if (from instanceof Date) clauses.push({ startsAt: { $gte: from } })
  if (to instanceof Date) clauses.push({ startsAt: { $lte: to } })
  if (createdUntil instanceof Date) clauses.push({ createdAt: { $lte: createdUntil } })
  if (typeof university === 'string') clauses.push({ university })
  if (interests.length > 0) clauses.push({ interests: { $in: interests } })

  const price = priceClause(onlyStrings(filters.priceRanges))
  if (price) clauses.push(price)

  // Cupo ilimitado = `capacity: null` (`$lte`/`$gt` contra null también cubren el campo ausente): nunca está lleno.
  clauses.push({
    $expr: availability === AVAILABILITY.FULL
      ? { $and: [{ $gt: ['$capacity', null] }, { $gte: ['$participantCount', '$capacity'] }] }
      : { $or: [{ $lte: ['$capacity', null] }, { $lt: ['$participantCount', '$capacity'] }] }
  })
  return clauses
}

/**
 * @param {import('mongoose').Model} PlanModel
 */
export function createPlanRepository (PlanModel) {
  const toObjectId = (id) => new mongoose.Types.ObjectId(id)

  return {
    /**
     * @param {object} data  Campos ya validados + `creatorId` (del token) y `university` (del perfil del creador).
     * @returns {Promise<PlanEntity>}
     */
    async create (data) {
      const doc = await PlanModel.create({ ...data, participantCount: 0, status: 'open' })
      return toEntity(doc)
    },

    /** @returns {Promise<PlanEntity | null>} */
    async findById (id) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findById(id).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Edita un plan en UNA operación condicional: solo si es del creador, sigue editable y (si se fija un cupo) el cupo
     * nuevo no queda por debajo de los inscriptos. Pasar a cupo ilimitado (`capacity: null`) no tiene condición. Nunca "consultar y después escribir" (regla 3).
     * @param {string} id
     * @param {string} creatorId
     * @param {Partial<PlanEntity>} changes
     * @returns {Promise<PlanEntity | null>} null si no se cumplió alguna condición (el servicio averigua cuál).
     */
    async updateByCreator (id, creatorId, changes) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(creatorId)) return null
      const $set = Object.fromEntries(Object.entries(changes).filter(([field]) => EDITABLE_FIELDS.includes(field)))
      const filter = { _id: id, creatorId, status: { $in: EDITABLE_STATUSES } }
      if (typeof $set.capacity === 'number') filter.$expr = { $lte: ['$participantCount', $set.capacity] }
      const doc = await PlanModel.findOneAndUpdate(filter, { $set }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    },

    /** @returns {Promise<PlanEntity | null>} null si el plan no existe o no es de ese creador. */
    async setPhotoKey (id, creatorId, photoKey) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(creatorId)) return null
      const doc = await PlanModel.findOneAndUpdate({ _id: id, creatorId }, { $set: { photoKey } }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Listado cronológico (sin `near`): por `startsAt` y `_id` ascendentes, con cursor sobre esa misma clave.
     * @param {object} params
     * @param {PlanFilters} params.filters
     * @param {Date} params.now
     * @param {{ startsAt: Date, id: string } | null} params.after  Última clave de la página anterior.
     * @param {number} params.limit
     * @returns {Promise<PlanEntity[]>}
     */
    async listUpcoming ({ filters, now, after, limit }) {
      const clauses = listClauses(filters, { startsAfter: now })
      if (after && mongoose.isValidObjectId(after.id)) {
        clauses.push({ $or: [{ startsAt: { $gt: after.startsAt } }, { startsAt: after.startsAt, _id: { $gt: toObjectId(after.id) } }] })
      }
      const docs = await PlanModel.find({ $and: clauses }).sort({ startsAt: 1, _id: 1 }).limit(limit).lean()
      return docs.map(toEntity)
    },

    /**
     * Candidatos del feed: los planes más cercanos a `near` dentro del radio, con su distancia en metros
     * (`$geoNear` sobre el índice 2dsphere). Solo los creados hasta `asOf` y que empiezan después: así el conjunto
     * es el mismo en todas las páginas de un mismo ranking.
     * @param {object} params
     * @param {[number, number]} params.near  `[lng, lat]`.
     * @param {number} params.maxDistanceMeters
     * @param {PlanFilters} params.filters
     * @param {Date} params.asOf
     * @param {number} params.limit  Tope de candidatos.
     * @returns {Promise<Array<PlanEntity & { distanceMeters: number }>>} del más cercano al más lejano.
     */
    async findNearby ({ near, maxDistanceMeters, filters, asOf, limit }) {
      const docs = await PlanModel.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [Number(near[0]), Number(near[1])] },
            key: 'location',
            spherical: true,
            maxDistance: maxDistanceMeters,
            distanceField: 'distanceMeters',
            query: { $and: listClauses(filters, { startsAfter: asOf, createdUntil: asOf }) }
          }
        },
        { $limit: limit }
      ])
      return docs.map(toEntity)
    },

    /**
     * Horario de planes vigentes (abiertos o cerrados, que todavía no terminaron): para contar como ocupadas las
     * franjas de los planes en los que el usuario ya está inscripto.
     * @param {string[]} ids
     * @param {{ endsAfter: Date }} options
     * @returns {Promise<Array<{ id: string, startsAt: Date, endsAt: Date }>>}
     */
    async findSchedulesByIds (ids, { endsAfter }) {
      const valid = ids.filter((id) => mongoose.isValidObjectId(id))
      if (valid.length === 0) return []
      const docs = await PlanModel
        .find({ _id: { $in: valid }, status: { $in: ['open', 'closed'] }, endsAt: { $gt: endsAfter } })
        .select({ startsAt: 1, endsAt: 1 })
        .lean()
      return docs.map((doc) => ({ id: String(doc._id), startsAt: doc.startsAt, endsAt: doc.endsAt }))
    }
  }
}
