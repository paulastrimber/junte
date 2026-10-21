// Acceso a la colección `plans`. Regla 8: las queries se arman acá a partir de filtros ya validados y predefinidos;
// nunca llega a MongoDB un operador ni un campo elegido por el cliente.
import mongoose from 'mongoose'
import { ATTENDANCE, computeCheckInWindow } from '../../shared/attendance.js'
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
 * @property {Date} checkInOpensAt
 * @property {Date} checkInClosesAt
 * @property {number} checkInRadiusMeters
 * @property {string} [qrNonceHash]  Nunca sale en una respuesta (el serializer no lo incluye).
 * @property {Date} [qrExpiresAt]
 * @property {string} [qrPreviousNonceHash]  Desafío anterior, válido hasta `qrPreviousExpiresAt`.
 * @property {Date} [qrPreviousExpiresAt]
 * @property {Date} [attendanceClosedAt]
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

/**
 * Planes que no se le muestran a un usuario en los listados para descubrir planes: los que creó y aquellos en los
 * que ya tiene inscripción activa (los ve en "Mis planes"). Lo arma el servicio a partir del token, nunca el cliente.
 * @typedef {object} PlanExclusion
 * @property {string} [creatorId]
 * @property {string[]} [planIds]
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
    checkInOpensAt: doc.checkInOpensAt,
    checkInClosesAt: doc.checkInClosesAt,
    checkInRadiusMeters: doc.checkInRadiusMeters,
    qrNonceHash: doc.qrNonceHash,
    qrExpiresAt: doc.qrExpiresAt,
    qrPreviousNonceHash: doc.qrPreviousNonceHash,
    qrPreviousExpiresAt: doc.qrPreviousExpiresAt,
    attendanceClosedAt: doc.attendanceClosedAt,
    createdAt: doc.createdAt,
    ...(doc.distanceMeters !== undefined ? { distanceMeters: doc.distanceMeters } : {})
  }
}

const EDITABLE_FIELDS = ['title', 'description', 'startsAt', 'endsAt', 'location', 'interests', 'capacity', 'price', 'checkInRadiusMeters']

// Estados en los que el plan sigue "vivo": admite bajas, QR, check-in y el cierre automático.
const LIVE_STATUSES = ['open', 'closed']

// Ventana de check-in calculada en la base a partir de las fechas RESULTANTES del documento (misma regla que
// `computeCheckInWindow`): así un PATCH de startsAt/endsAt nunca deja una ventana vieja.
const CHECK_IN_WINDOW_STAGE = {
  $set: {
    checkInOpensAt: { $subtract: ['$startsAt', ATTENDANCE.OPENS_BEFORE_START_MS] },
    checkInClosesAt: { $min: [{ $add: ['$startsAt', ATTENDANCE.CLOSES_AFTER_START_MS] }, '$endsAt'] }
  }
}

// Con cupo ilimitado (`capacity: null`) siempre hay lugar: `$lt` contra null sería false, por eso el `$or`.
const HAS_ROOM = { $or: [{ $lte: ['$capacity', null] }, { $lt: ['$participantCount', '$capacity'] }] }

const onlyStrings = (values) => (Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [])

function priceClause (keys) {
  const ranges = PRICE_RANGES.filter((range) => keys.includes(range.key))
  if (ranges.length === 0) return null
  return { $or: ranges.map(({ min, max }) => ({ price: max === null ? { $gte: min } : { $gte: min, $lte: max } })) }
}

/**
 * Condiciones comunes de los listados: planes abiertos que todavía no empezaron, más los filtros predefinidos.
 * @param {PlanFilters} filters
 * @param {{ startsAfter: Date, createdUntil?: Date, exclude?: PlanExclusion }} window
 * @returns {object[]} cláusulas para un `$and`.
 */
function listClauses (filters, { startsAfter, createdUntil, exclude = {} }) {
  const { from, to, university, availability = AVAILABILITY.AVAILABLE } = filters
  const interests = onlyStrings(filters.interests)
  const clauses = [{ status: 'open' }, { startsAt: { $gt: startsAfter } }]

  if (from instanceof Date) clauses.push({ startsAt: { $gte: from } })
  if (to instanceof Date) clauses.push({ startsAt: { $lte: to } })
  if (createdUntil instanceof Date) clauses.push({ createdAt: { $lte: createdUntil } })
  if (mongoose.isValidObjectId(exclude.creatorId)) clauses.push({ creatorId: { $ne: new mongoose.Types.ObjectId(exclude.creatorId) } })
  const excludedIds = onlyStrings(exclude.planIds).filter((id) => mongoose.isValidObjectId(id))
  if (excludedIds.length > 0) clauses.push({ _id: { $nin: excludedIds.map((id) => new mongoose.Types.ObjectId(id)) } })
  if (typeof university === 'string') clauses.push({ university })
  if (interests.length > 0) clauses.push({ interests: { $in: interests } })

  const price = priceClause(onlyStrings(filters.priceRanges))
  if (price) clauses.push(price)

  // Cupo ilimitado = `capacity: null` (`$lte`/`$gt` contra null también cubren el campo ausente): nunca está lleno.
  clauses.push({
    $expr: availability === AVAILABILITY.FULL
      ? { $and: [{ $gt: ['$capacity', null] }, { $gte: ['$participantCount', '$capacity'] }] }
      : HAS_ROOM
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
      const doc = await PlanModel.create({ ...data, ...computeCheckInWindow(data), participantCount: 0, status: 'open' })
      return toEntity(doc)
    },

    /** @returns {Promise<PlanEntity | null>} */
    async findById (id) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findById(id).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Varios planes en una sola consulta (vista previa de los reportes). Ignora los IDs inválidos.
     * @param {string[]} ids
     * @returns {Promise<PlanEntity[]>} sin orden garantizado.
     */
    async findByIds (ids) {
      const valid = [...new Set(ids)].filter((id) => mongoose.isValidObjectId(id))
      if (valid.length === 0) return []
      return (await PlanModel.find({ _id: { $in: valid } }).lean()).map(toEntity)
    },

    /**
     * Para las métricas del panel.
     * @param {{ since: Date }} params
     * @returns {Promise<{ total: number, createdSince: number }>}
     */
    async countMetrics ({ since }) {
      const [total, createdSince] = await Promise.all([
        PlanModel.countDocuments({}),
        PlanModel.countDocuments({ createdAt: { $gte: since } })
      ])
      return { total, createdSince }
    },

    /**
     * Edita un plan en UNA operación condicional: solo si es del creador, sigue editable y (si se fija un cupo) el cupo
     * nuevo no queda por debajo de los inscriptos. Pasar a cupo ilimitado (`capacity: null`) no tiene condición. Nunca "consultar y después escribir" (regla 3).
     * Si cambian las fechas, la ventana de check-in se recalcula en la misma operación.
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
      // Pipeline: los valores van con `$literal` (un texto que empieza con "$" no se interpreta como campo) y la
      // ventana de check-in se recalcula en la misma operación.
      const literals = Object.fromEntries(Object.entries($set).map(([field, value]) => [field, { $literal: value }]))
      const doc = await PlanModel
        .findOneAndUpdate(filter, [{ $set: { ...literals, updatedAt: '$$NOW' } }, CHECK_IN_WINDOW_STAGE], { returnDocument: 'after', updatePipeline: true })
        .lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Cambia el estado en UNA operación condicional (solo el creador y solo desde los estados permitidos).
     * @param {string} id
     * @param {string} creatorId
     * @param {{ from: string[], to: string, startsAfter?: Date, endsAfter?: Date }} transition
     *   `startsAfter`: el plan no tiene que haber empezado; `endsAfter`: no tiene que haber terminado.
     * @returns {Promise<PlanEntity | null>} null si no se cumplió alguna condición.
     */
    async transitionStatus (id, creatorId, { from, to, startsAfter, endsAfter }) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(creatorId)) return null
      const filter = { _id: id, creatorId, status: { $in: from } }
      if (startsAfter instanceof Date) filter.startsAt = { $gt: startsAfter }
      if (endsAfter instanceof Date) filter.endsAt = { $gt: endsAfter }
      const doc = await PlanModel.findOneAndUpdate(filter, { $set: { status: to } }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Inscripción: condición (abierto, sin empezar y con lugar) y `$inc` en una sola operación atómica (regla 3).
     * @param {string} id
     * @param {{ now: Date, session?: import('mongoose').ClientSession }} options
     * @returns {Promise<PlanEntity | null>} null si no se pudo (el servicio averigua el motivo).
     */
    async incrementIfCapacity (id, { now, session }) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findOneAndUpdate(
        { _id: id, status: 'open', startsAt: { $gt: now }, $expr: HAS_ROOM },
        { $inc: { participantCount: 1 } },
        { returnDocument: 'after', session }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Baja: libera un lugar si el plan sigue vivo y no empezó. Nunca deja el contador por debajo de 0.
     * @param {string} id
     * @param {{ now: Date, session?: import('mongoose').ClientSession }} options
     * @returns {Promise<PlanEntity | null>} null si el plan ya no admite bajas.
     */
    async decrementCount (id, { now, session }) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findOneAndUpdate(
        { _id: id, status: { $in: LIVE_STATUSES }, startsAt: { $gt: now }, participantCount: { $gt: 0 } },
        { $inc: { participantCount: -1 } },
        { returnDocument: 'after', session }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Guarda el desafío QR vigente: solo el creador, con el plan vivo y dentro de la ventana. En la misma operación
     * el desafío que estaba vigente pasa a ser "el anterior", válido hasta `previousValidUntil` (y nunca más allá de
     * su propio vencimiento). Solo se conserva uno: el anterior al anterior deja de valer.
     * @param {string} id
     * @param {string} creatorId
     * @param {{ qrNonceHash: string, qrExpiresAt: Date, previousValidUntil: Date, now: Date }} qr
     * @returns {Promise<PlanEntity | null>} null si no se cumplió alguna condición.
     */
    async setQr (id, creatorId, { qrNonceHash, qrExpiresAt, previousValidUntil, now }) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(creatorId)) return null
      const doc = await PlanModel.findOneAndUpdate(
        { _id: id, creatorId, status: { $in: LIVE_STATUSES }, checkInOpensAt: { $lte: now }, checkInClosesAt: { $gte: now } },
        [
          {
            $set: {
              // Sin desafío vigente (primer QR del plan) no queda ninguno anterior.
              qrPreviousNonceHash: { $ifNull: ['$qrNonceHash', '$$REMOVE'] },
              qrPreviousExpiresAt: { $cond: [{ $gt: ['$qrNonceHash', null] }, { $min: ['$qrExpiresAt', previousValidUntil] }, '$$REMOVE'] }
            }
          },
          { $set: { qrNonceHash: { $literal: qrNonceHash }, qrExpiresAt, updatedAt: '$$NOW' } }
        ],
        { returnDocument: 'after', updatePipeline: true }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Marca la asistencia del plan como cerrada. La condición (`attendanceClosedAt` vacío) hace que solo una
     * ejecución lo logre aunque dos instancias lleguen juntas. Los planes cancelados no se procesan.
     * @param {string} id
     * @param {{ now: Date, session?: import('mongoose').ClientSession }} options
     * @returns {Promise<PlanEntity | null>} null si no correspondía (ya cerrada, ventana abierta, plan cancelado…).
     */
    async markAttendanceClosed (id, { now, session }) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findOneAndUpdate(
        { _id: id, status: { $in: LIVE_STATUSES }, attendanceClosedAt: null, checkInClosesAt: { $lt: now } },
        { $set: { attendanceClosedAt: now } },
        { returnDocument: 'after', session }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Pasa a `completed` un plan vivo que ya terminó.
     * @param {string} id
     * @param {{ now: Date, session?: import('mongoose').ClientSession }} options
     * @returns {Promise<PlanEntity | null>} null si no correspondía.
     */
    async complete (id, { now, session }) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await PlanModel.findOneAndUpdate(
        { _id: id, status: { $in: LIVE_STATUSES }, endsAt: { $lte: now } },
        { $set: { status: 'completed' } },
        { returnDocument: 'after', session }
      ).lean()
      return doc ? toEntity(doc) : null
    },

    /** @returns {Promise<string[]>} planes vivos con la ventana de check-in cerrada y la asistencia sin cerrar. */
    async findIdsDueForAttendanceClose ({ now, limit }) {
      const docs = await PlanModel
        .find({ status: { $in: LIVE_STATUSES }, attendanceClosedAt: null, checkInClosesAt: { $lt: now } })
        .select({ _id: 1 }).sort({ checkInClosesAt: 1 }).limit(limit).lean()
      return docs.map((doc) => String(doc._id))
    },

    /** @returns {Promise<string[]>} planes vivos que ya terminaron (`endsAt` pasó). */
    async findIdsDueForCompletion ({ now, limit }) {
      const docs = await PlanModel
        .find({ status: { $in: LIVE_STATUSES }, endsAt: { $lte: now } })
        .select({ _id: 1 }).sort({ endsAt: 1 }).limit(limit).lean()
      return docs.map((doc) => String(doc._id))
    },

    /**
     * "Mis planes": los creados por el usuario o un conjunto de planes (aquellos en los que está inscripto), en
     * cualquier estado. `upcoming` = todavía no terminó, del más próximo al más lejano; `past` = ya terminó, del más
     * reciente al más viejo. Cursor sobre `startsAt` + `_id`.
     * @param {object} params
     * @param {{ creatorId: string } | { ids: string[] }} params.scope
     * @param {'upcoming' | 'past'} params.when
     * @param {Date} params.now
     * @param {{ startsAt: Date, id: string } | null} params.after
     * @param {number} params.limit
     * @returns {Promise<PlanEntity[]>}
     */
    async listMine ({ scope, when, now, after, limit }) {
      const clauses = []
      if (typeof scope.creatorId === 'string') {
        if (!mongoose.isValidObjectId(scope.creatorId)) return []
        clauses.push({ creatorId: toObjectId(scope.creatorId) })
      } else {
        const ids = onlyStrings(scope.ids).filter((id) => mongoose.isValidObjectId(id))
        if (ids.length === 0) return []
        clauses.push({ _id: { $in: ids.map(toObjectId) } })
      }
      const isPast = when === 'past'
      clauses.push({ endsAt: isPast ? { $lte: now } : { $gt: now } })
      if (after && mongoose.isValidObjectId(after.id)) {
        const beyond = isPast ? '$lt' : '$gt'
        clauses.push({ $or: [{ startsAt: { [beyond]: after.startsAt } }, { startsAt: after.startsAt, _id: { [beyond]: toObjectId(after.id) } }] })
      }
      const direction = isPast ? -1 : 1
      const docs = await PlanModel.find({ $and: clauses }).sort({ startsAt: direction, _id: direction }).limit(limit).lean()
      return docs.map(toEntity)
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
     * @param {PlanExclusion} [params.exclude]
     * @returns {Promise<PlanEntity[]>}
     */
    async listUpcoming ({ filters, now, after, limit, exclude }) {
      const clauses = listClauses(filters, { startsAfter: now, exclude })
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
     * @param {PlanExclusion} [params.exclude]
     * @returns {Promise<Array<PlanEntity & { distanceMeters: number }>>} del más cercano al más lejano.
     */
    async findNearby ({ near, maxDistanceMeters, filters, asOf, limit, exclude }) {
      const docs = await PlanModel.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [Number(near[0]), Number(near[1])] },
            key: 'location',
            spherical: true,
            maxDistance: maxDistanceMeters,
            distanceField: 'distanceMeters',
            query: { $and: listClauses(filters, { startsAfter: asOf, createdUntil: asOf, exclude }) }
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
