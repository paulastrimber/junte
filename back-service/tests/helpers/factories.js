// Factories para tests de integración/contrato: crean documentos válidos con overrides.
// Escriben directo con los modelos (sin pasar por servicios). Nunca usar contraseñas reales.
import { User } from '../../src/modules/users/user.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { Participation } from '../../src/modules/participations/participation.model.js'

// Centro de Montevideo, GeoJSON [lng, lat].
export const MONTEVIDEO = Object.freeze([-56.1645, -34.9011])

let sequence = 0
const next = () => ++sequence

export async function makeUser (overrides = {}) {
  const n = next()
  return User.create({
    email: `user${n}@test.junte`,
    passwordHash: '!test-no-login',
    name: `Usuario ${n}`,
    university: 'um',
    interests: ['futbol'],
    ...overrides
  })
}

export async function makePlan (overrides = {}) {
  const creatorId = overrides.creatorId ?? (await makeUser())._id
  const startsAt = overrides.startsAt ?? new Date(Date.UTC(2030, 0, 1, 18))
  return Plan.create({
    title: `Plan ${next()}`,
    startsAt,
    endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
    location: { label: 'Montevideo', type: 'Point', coordinates: [...MONTEVIDEO] },
    interests: ['futbol'],
    university: 'um',
    capacity: 5,
    ...overrides,
    creatorId
  })
}

export async function makeParticipation (overrides = {}) {
  return Participation.create({
    status: 'active',
    joinedAt: new Date(Date.UTC(2029, 11, 1)),
    ...overrides
  })
}
