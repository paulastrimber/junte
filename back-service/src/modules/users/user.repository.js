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
 * @property {string} [university]
 * @property {string} [neighborhood]
 * @property {string} [city]
 * @property {string[]} interests
 * @property {'user' | 'admin'} role
 * @property {'active' | 'suspended'} status
 * @property {number} reputation
 * @property {string} [photoKey]
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
    neighborhood: doc.neighborhood,
    city: doc.city,
    interests: doc.interests ?? [],
    role: doc.role,
    status: doc.status,
    reputation: doc.reputation ?? 0,
    photoKey: doc.photoKey,
    createdAt: doc.createdAt
  }
}

const isDuplicateEmail = (err) => err?.code === DUPLICATE_KEY && (err.keyPattern?.email !== undefined || /email/.test(err.message ?? ''))

// Campos que un perfil puede cambiar. Lo demás (role, status, reputation, passwordHash…) se descarta
// acá aunque alguien lo pase por error: el repositorio no es la barrera de validación, es la última red.
const PROFILE_FIELDS = ['name', 'birthDate', 'university', 'neighborhood', 'city', 'interests']

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
     * @param {Partial<Pick<UserEntity, 'name' | 'birthDate' | 'university' | 'neighborhood' | 'city' | 'interests'>>} changes
     * @returns {Promise<UserEntity | null>}
     */
    async updateProfile (id, changes) {
      if (!mongoose.isValidObjectId(id)) return null
      const $set = Object.fromEntries(Object.entries(changes).filter(([field]) => PROFILE_FIELDS.includes(field)))
      const doc = await UserModel.findByIdAndUpdate(id, { $set }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    },

    /** @returns {Promise<UserEntity | null>} */
    async setPhotoKey (id, photoKey) {
      if (!mongoose.isValidObjectId(id)) return null
      const doc = await UserModel.findByIdAndUpdate(id, { $set: { photoKey } }, { returnDocument: 'after', runValidators: true }).lean()
      return doc ? toEntity(doc) : null
    }
  }
}
