// Operaciones sobre cuentas de administración (S6-BE-04, ADR-0004). Nunca se exponen por la API: solo las corre alguien
// con acceso a la base (en AWS, por Session Manager). Las usa scripts/admin.js; separadas para poder testearlas.
import { User } from '../src/modules/users/user.model.js'

// Más larga que la mínima de un usuario común (8): una cuenta admin puede suspender a otros.
export const ADMIN_PASSWORD_MIN = 12

const normalize = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '')

function requireEmail (email) {
  const normalized = normalize(email)
  if (!/^[^\s@]+@[^\s@]+$/.test(normalized)) throw new Error('el email no es válido')
  return normalized
}

/**
 * Le da el rol admin a una cuenta que ya existe. No cambia su estado: una cuenta suspendida sigue suspendida.
 * @param {{ email: string }} params
 * @returns {Promise<{ email: string, changed: boolean, status: string }>}
 */
export async function promoteAdmin ({ email }) {
  const normalized = requireEmail(email)
  const before = await User.findOneAndUpdate({ email: normalized }, { $set: { role: 'admin' } }, { returnDocument: 'before', runValidators: true }).lean()
  if (!before) throw new Error(`no existe una cuenta con el email ${normalized} (usá "create" para crearla)`)
  return { email: normalized, changed: before.role !== 'admin', status: before.status }
}

/**
 * Crea una cuenta admin nueva (activa y con el onboarding salteado: no usa la app).
 * @param {{ email: string, name: string, password: string, passwordHasher: import('../src/adapters/passwordHasher.js').PasswordHasher }} params
 * @returns {Promise<{ email: string }>}
 */
export async function createAdmin ({ email, name, password, passwordHasher }) {
  const normalized = requireEmail(email)
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (trimmedName === '' || trimmedName.length > 80) throw new Error('el nombre tiene que tener entre 1 y 80 caracteres')
  if (typeof password !== 'string' || password.length < ADMIN_PASSWORD_MIN || password.length > 128) {
    throw new Error(`la contraseña (ADMIN_PASSWORD) tiene que tener entre ${ADMIN_PASSWORD_MIN} y 128 caracteres`)
  }
  if (await User.exists({ email: normalized })) throw new Error(`ya existe una cuenta con el email ${normalized} (usá "promote")`)

  await User.create({
    email: normalized,
    passwordHash: await passwordHasher.hash(password),
    name: trimmedName,
    role: 'admin',
    status: 'active',
    onboardingCompletedAt: new Date()
  })
  return { email: normalized }
}

/**
 * Le quita el rol admin a una cuenta. Nunca deja la base sin ninguna cuenta admin activa.
 * @param {{ email: string }} params
 * @returns {Promise<{ email: string, changed: boolean }>}
 */
export async function demoteAdmin ({ email }) {
  const normalized = requireEmail(email)
  const user = await User.findOne({ email: normalized }).lean()
  if (!user) throw new Error(`no existe una cuenta con el email ${normalized}`)
  if (user.role !== 'admin') return { email: normalized, changed: false }

  const otherActiveAdmins = await User.countDocuments({ role: 'admin', status: 'active', _id: { $ne: user._id } })
  if (otherActiveAdmins === 0) throw new Error('es la única cuenta admin activa: promové otra antes de quitarle el rol')
  await User.updateOne({ _id: user._id, role: 'admin' }, { $set: { role: 'user' } })
  return { email: normalized, changed: true }
}
