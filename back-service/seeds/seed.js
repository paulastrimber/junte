// Siembra idempotente: se puede correr N veces y el resultado es el mismo (upserts por clave natural).
// Usuarios por `email`; planes por `{ creatorId, title }`; inscripciones por `{ planId, userId }`.
// `participantCount` se recalcula dentro de la misma transacción que las inscripciones (invariante 1).
import { withTransaction } from '../src/adapters/db/index.js'
import { User } from '../src/modules/users/user.model.js'
import { Plan } from '../src/modules/plans/plan.model.js'
import { Participation } from '../src/modules/participations/participation.model.js'
import { parseCalendarDate, toUtcMidnight } from '../src/shared/age.js'
import { PLANS, USERS } from './data.js'

const MONTEVIDEO_UTC_OFFSET_HOURS = -3
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_DURATION_HOURS = 2
const UPSERT = { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }

function startsAtFor ({ daysFromNow, hour }, now) {
  const day = new Date(now.getTime() + daysFromNow * DAY_MS)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - MONTEVIDEO_UTC_OFFSET_HOURS))
}

// El hash se recalcula solo si hace falta: Argon2 usa una sal nueva en cada hash, así que volver a
// hashear en cada corrida cambiaría el documento sin que cambie nada de verdad.
async function passwordHashFor (existing, { passwordHasher, password }) {
  if (existing && await passwordHasher.verify(existing.passwordHash, password)) return existing.passwordHash
  return passwordHasher.hash(password)
}

async function seedUsers ({ passwordHasher, password, now }) {
  const byKey = new Map()
  for (const { key, email, birthDate, onboarded, ...profile } of USERS) {
    const existing = await User.findOne({ email }).lean()
    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          ...profile,
          ...(birthDate ? { birthDate: toUtcMidnight(parseCalendarDate(birthDate)) } : {}),
          ...(onboarded ? { onboardingCompletedAt: existing?.onboardingCompletedAt ?? now } : {}),
          passwordHash: await passwordHashFor(existing, { passwordHasher, password })
        },
        $setOnInsert: { email }
      },
      UPSERT
    )
    byKey.set(key, user)
  }
  return byKey
}

async function seedPlan (spec, users, now) {
  const creator = users.get(spec.creator)
  const startsAt = startsAtFor(spec, now)
  return withTransaction(async (session) => {
    const plan = await Plan.findOneAndUpdate(
      { creatorId: creator._id, title: spec.title },
      {
        $set: {
          description: spec.description,
          startsAt,
          endsAt: new Date(startsAt.getTime() + (spec.durationHours ?? DEFAULT_DURATION_HOURS) * HOUR_MS),
          price: spec.price ?? 0,
          location: { type: 'Point', ...spec.location },
          interests: spec.interests,
          university: creator.university,
          capacity: spec.capacity,
          status: 'open'
        },
        $setOnInsert: { participantCount: 0 }
      },
      { ...UPSERT, session }
    )

    for (const key of spec.participants) {
      await Participation.findOneAndUpdate(
        { planId: plan._id, userId: users.get(key)._id },
        {
          $set: { status: 'active', noShow: false },
          $unset: { cancelledAt: '', noShowAt: '' },
          $setOnInsert: { joinedAt: now }
        },
        { ...UPSERT, session }
      )
    }

    const participantCount = await Participation.countDocuments({ planId: plan._id, status: 'active' }).session(session)
    if (spec.capacity !== null && participantCount > spec.capacity) {
      throw new Error(`seed: el plan "${spec.title}" tiene más inscriptos (${participantCount}) que cupo (${spec.capacity})`)
    }
    await Plan.updateOne({ _id: plan._id }, { $set: { participantCount } }, { session })
    return plan
  })
}

/**
 * Carga los datos de desarrollo. Requiere la conexión abierta y las migraciones aplicadas.
 * @param {object} options
 * @param {import('../src/adapters/passwordHasher.js').PasswordHasher} options.passwordHasher
 * @param {string} options.password  Contraseña de todos los usuarios de ejemplo (SEED_PASSWORD). Nunca fija en el código.
 * @param {Date} [options.now]  Fijo para tests.
 * @returns {Promise<{ users: number, plans: number, participations: number }>}
 */
export async function seed ({ passwordHasher, password, now = new Date() }) {
  if (typeof password !== 'string' || password === '') {
    throw new Error('seed: falta la contraseña de los usuarios de ejemplo (variable SEED_PASSWORD)')
  }
  const users = await seedUsers({ passwordHasher, password, now })
  let participations = 0
  for (const spec of PLANS) {
    await seedPlan(spec, users, now)
    participations += spec.participants.length
  }
  return { users: users.size, plans: PLANS.length, participations }
}
