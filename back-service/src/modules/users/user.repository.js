// Acceso a la colección `users`. Traduce los errores de MongoDB conocidos a AppError
// (E11000 del email → EMAIL_TAKEN): un servicio nunca ve un código de Mongo.
import mongoose from 'mongoose'
import { AppError } from '../../shared/errors.js'

const DUPLICATE_KEY = 11000

/**
 * @typedef {object} UserEntity
 * @property {string} id
 * @property {string} email
 * @property {string} passwordHash  Solo para auth: el serializer nunca lo expone.
 * @property {string} [name]
 * @property {Date} [birthDate]
 * @property {string} [university]  Clave del catálogo, o `other`.
 * @property {string} [career]
 * @property {string} [city]
 * @property {string} [neighborhood]
 * @property {string[]} interests
 * @property {'user' | 'admin'} role
 * @property {'active' | 'suspended'} status
 * @property {number} reputation
 * @property {string} [photoKey]
 * @property {Date} [onboardingCompletedAt]
 * @property {Date} createdAt
 */

/** @returns {UserEntity} */
function toEntity (doc) {
  return {
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name,
    birthDate: doc.birthDate,
    university: doc.university,
    career: doc.career,
    city: doc.city,
    neighborhood: doc.neighborhood,
    interests: doc.interests ?? [],
    role: doc.role,
    status: doc.status,
    reputation: doc.reputation ?? 0,
    photoKey: doc.photoKey,
    onboardingCompletedAt: doc.onboardingCompletedAt,
    createdAt: doc.createdAt
  }
}

const isDuplicateEmail = (err) => err?.code === DUPLICATE_KEY && (err.keyPattern?.email !== undefined || /email/.test(err.message ?? ''))

// Campos que un perfil puede cambiar. Lo demás (role, status, reputation, passwordHash…) se descarta
// acá aunque alguien lo pase por error: el repositorio no es la barrera de validación, es la última red.
const PROFILE_FIELDS = ['name', 'birthDate', 'university', 'career', 'city', 'neighborhood', 'interests', 'onboardingCompletedAt']
// Campos que se pueden quitar cuando deja de valer lo que los sostenía (carrera sin universidad, barrio sin ciudad).
const UNSETTABLE_FIELDS = ['career', 'neighborhood']

/**
 * @param {import('mongoose').Model} UserModel
 */
export function createUserRepository (UserModel) {
  return {
    /**
     * @param {{ email: string, passwordHash: string, name?: string, university?: string, interests?: string[] }} data
     * @returns {Promise<UserEntity>}
     * @throws {AppError} EMAIL_TAKEN
     */
    async create (data) {
      try {
        return toEntity(await UserModel.create(data))
      } catch (err) {
        if (isDuplicateEmail(err)) throw new AppError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email')
        throw err
      }
    },

    /** @returns {Promise<UserEntity | null>} */
    async findById (id) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await UserModel.findById(id).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * Varios usuarios en una sola consulta (p. ej. los creadores de una página de planes). Ignora los IDs inválidos.
     * @param {string[]} ids
     * @returns {Promise<UserEntity[]>} sin orden garantizado.
     */
    async findByIds (ids) {
      const valid = [...new Set(ids)].filter((id) => mongoose.isValidObjectId(id))
      if (valid.length === 0) return []
      return (await UserModel.find({ _id: { $in: valid } }).lean()).map(toEntity)
    },

    /**
     * Regla 8: solo se acepta un string; un objeto con operadores nunca llega a MongoDB.
     * @returns {Promise<UserEntity | null>}
     */
    async findByEmail (email) {
      if (typeof email !== 'string') return null
      const doc = await UserModel.findOne({ email: email.trim().toLowerCase() }).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * @param {string} id
     * @param {Partial<Pick<UserEntity, 'name' | 'birthDate' | 'university' | 'career' | 'city' | 'neighborhood' | 'interests' | 'onboardingCompletedAt'>>} changes
     * @param {{ unset?: Array<'career' | 'neighborhood'> }} [options]  Campos a quitar en la misma operación.
     * @returns {Promise<UserEntity | null>}
     */
    async updateProfile (id, changes, { unset = [] } = {}) {
      if (!mongoose.isValidObjectId(id)) return null
      const $set = Object.fromEntries(Object.entries(changes).filter(([field]) => PROFILE_FIELDS.includes(field)))
      const $unset = Object.fromEntries(unset.filter((field) => UNSETTABLE_FIELDS.includes(field) && !(field in $set)).map((field) => [field, '']))
      const update = { ...(Object.keys($set).length > 0 ? { $set } : {}), ...(Object.keys($unset).length > 0 ? { $unset } : {}) }
      if (Object.keys(update).length === 0) return this.findById(id)
      const doc = await UserModel.findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    },

    /**
     * +1 de reputación (solo-backend). Va dentro de la transacción del check-in o del cierre de asistencia.
     * @param {string} id
     * @param {{ session?: import('mongoose').ClientSession }} [options]
     * @returns {Promise<boolean>} false si el usuario no existe.
     */
    async incrementReputation (id, { session } = {}) {
      if (!mongoose.isValidObjectId(id)) return false
      const result = await UserModel.updateOne({ _id: id }, { $inc: { reputation: 1 } }, { session })
      return result.matchedCount === 1
    },

    /** @returns {Promise<UserEntity | null>} */
    async setPhotoKey (id, photoKey) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await UserModel.findByIdAndUpdate(id, { $set: { photoKey } }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    }
  }
}
