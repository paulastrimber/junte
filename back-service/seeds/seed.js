// Siembra idempotente: se puede correr N veces y el resultado es el mismo (upserts por clave natural).
// Usuarios por `email`; planes por `{ creatorId, title }`; inscripciones por `{ planId, userId }`.
// `participantCount` se recalcula dentro de la misma transacción que las inscripciones (invariante 1).
import { withTransaction } from '../src/adapters/db/index.js'
import { User } from '../src/modules/users/user.model.js'
import { Plan } from '../src/modules/plans/plan.model.js'
import { Participation } from '../src/modules/participations/participation.model.js'
import { PLANS, USERS } from './data.js'

// No es un hash válido de Argon2/bcrypt: estas cuentas no pueden iniciar sesión hasta que auth
// defina cómo se hashea (ver docs/pendientes.md, sección C · back-data).
export const NO_LOGIN_PASSWORD_HASH = '!seed-no-login'

const MONTEVIDEO_UTC_OFFSET_HOURS = -3
const DAY_MS = 24 * 60 * 60 * 1000
const UPSERT = { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }

function startsAtFor ({ daysFromNow, hour }, now) {
  const day = new Date(now.getTime() + daysFromNow * DAY_MS)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - MONTEVIDEO_UTC_OFFSET_HOURS))
}

async function seedUsers () {
  const byKey = new Map()
  for (const { key, email, ...profile } of USERS) {
    const user = await User.findOneAndUpdate(
      { email },
      { $set: profile, $setOnInsert: { email, passwordHash: NO_LOGIN_PASSWORD_HASH } },
      UPSERT
    )
    byKey.set(key, user)
  }
  return byKey
}

async function seedPlan (spec, users, now) {
  const creator = users.get(spec.creator)
  return withTransaction(async (session) => {
    const plan = await Plan.findOneAndUpdate(
      { creatorId: creator._id, title: spec.title },
      {
        $set: {
          description: spec.description,
          startsAt: startsAtFor(spec, now),
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
    if (participantCount > spec.capacity) {
      throw new Error(`seed: el plan "${spec.title}" tiene más inscriptos (${participantCount}) que cupo (${spec.capacity})`)
    }
    await Plan.updateOne({ _id: plan._id }, { $set: { participantCount } }, { session })
    return plan
  })
}

/**
 * Carga los datos de desarrollo. Requiere la conexión abierta y las migraciones aplicadas.
 * @param {{ now?: Date }} [options]  `now` fijo para tests.
 * @returns {Promise<{ users: number, plans: number, participations: number }>}
 */
export async function seed ({ now = new Date() } = {}) {
  const users = await seedUsers()
  let participations = 0
  for (const spec of PLANS) {
    await seedPlan(spec, users, now)
    participations += spec.participants.length
  }
  return { users: users.size, plans: PLANS.length, participations }
}
