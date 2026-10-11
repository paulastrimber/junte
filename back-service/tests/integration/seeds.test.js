import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { createFastHasher } from '../helpers/fast-hasher.js'
import { buildTestModules } from '../helpers/modules.js'
import { seed } from '../../seeds/seed.js'
import { USERS } from '../../seeds/data.js'
import { MAX_AGE, MIN_AGE, ageOn, calendarDateIn, fromUtcMidnight, parseCalendarDate } from '../../src/shared/age.js'
import { INTERESTS, MAX_INTERESTS } from '../../src/shared/interests.js'
import { User } from '../../src/modules/users/user.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { Participation } from '../../src/modules/participations/participation.model.js'

useTestDb()

const NOW = new Date('2026-10-07T12:00:00Z')
// Contraseña de ejemplo solo para los tests: los seeds reales la leen de SEED_PASSWORD.
const PASSWORD = 'seed-test-password'
const passwordHasher = createFastHasher()
const run = (options = {}) => seed({ now: NOW, passwordHasher, password: PASSWORD, ...options })

async function snapshot () {
  return {
    users: await User.countDocuments(),
    admins: await User.countDocuments({ role: 'admin' }),
    plans: await Plan.countDocuments(),
    participations: await Participation.countDocuments()
  }
}

describe('seeds', () => {
  it('cargan usuarios, un admin y planes en Montevideo con [lng, lat]', async () => {
    await run()

    const plans = await Plan.find()
    expect((await snapshot()).admins).toBe(1)
    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      const [lng, lat] = plan.location.coordinates
      expect(lng).toBeGreaterThan(-56.5)
      expect(lng).toBeLessThan(-56.0)
      expect(lat).toBeGreaterThan(-35.0)
      expect(lat).toBeLessThan(-34.7)
      expect(plan.startsAt.getTime()).toBeGreaterThan(NOW.getTime())
    }
  })

  it('son idempotentes', async () => {
    await run()
    const first = await snapshot()

    await run()

    expect(await snapshot()).toEqual(first)
  })

  it('participantCount coincide con las inscripciones activas', async () => {
    await run()
    await run()

    for (const plan of await Plan.find()) {
      const active = await Participation.countDocuments({ planId: plan._id, status: 'active' })
      expect(plan.participantCount).toBe(active)
      expect(plan.participantCount).toBeLessThanOrEqual(plan.capacity)
    }
  })

  describe('contraseña (SEED_PASSWORD)', () => {
    it('exige una contraseña: no hay un valor por defecto en el código', async () => {
      await expect(seed({ now: NOW, passwordHasher })).rejects.toThrow(/SEED_PASSWORD/)
      await expect(seed({ now: NOW, passwordHasher, password: '' })).rejects.toThrow(/SEED_PASSWORD/)
      expect(await User.countDocuments()).toBe(0)
    })

    it('hashea la contraseña de cada usuario (nunca queda en claro) y se puede iniciar sesión con ella', async () => {
      await run()
      const { authService } = buildTestModules({ start: NOW.toISOString() })

      const hashes = (await User.find().lean()).map((user) => user.passwordHash)
      expect(hashes.every((hash) => hash.startsWith('fast$') && !hash.includes(PASSWORD))).toBe(true)
      await expect(authService.login({ email: 'lucia@junte.test', password: PASSWORD })).resolves.toMatchObject({ user: { name: 'Lucía Pérez' } })
      await expect(authService.login({ email: 'lucia@junte.test', password: 'otra-contraseña' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })

    it('el usuario suspendido del seed no puede entrar (ACCOUNT_SUSPENDED)', async () => {
      await run()
      const { authService } = buildTestModules({ start: NOW.toISOString() })

      await expect(authService.login({ email: 'suspendido@junte.test', password: PASSWORD })).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' })
    })

    it('volver a correr el seed con la misma contraseña no cambia los hashes', async () => {
      await run()
      const before = (await User.find().sort('email').lean()).map((user) => user.passwordHash)

      await run()

      expect((await User.find().sort('email').lean()).map((user) => user.passwordHash)).toEqual(before)
    })

    it('con otra contraseña actualiza los hashes', async () => {
      await run()

      await run({ password: 'nueva-contraseña' })

      const { authService } = buildTestModules({ start: NOW.toISOString() })
      await expect(authService.login({ email: 'lucia@junte.test', password: 'nueva-contraseña' })).resolves.toBeDefined()
    })

    it('reemplaza el hash inválido que dejaba el seed anterior (!seed-no-login)', async () => {
      await User.create({ email: 'lucia@junte.test', passwordHash: '!seed-no-login', name: 'Vieja' })

      await run()

      const { authService } = buildTestModules({ start: NOW.toISOString() })
      await expect(authService.login({ email: 'lucia@junte.test', password: PASSWORD })).resolves.toBeDefined()
      expect(await User.countDocuments({ email: 'lucia@junte.test' })).toBe(1)
    })
  })

  describe('perfiles de ejemplo', () => {
    it('cargan birthDate (medianoche UTC), barrio y localidad', async () => {
      await run()

      const lucia = await User.findOne({ email: 'lucia@junte.test' })
      expect(lucia.birthDate.toISOString()).toMatch(/T00:00:00\.000Z$/)
      expect(lucia.neighborhood).toBeTruthy()
      expect(lucia.city).toBeTruthy()
    })

    it('las fechas de nacimiento del seed dan una edad válida (16 a 100)', () => {
      const today = calendarDateIn(NOW)
      for (const { birthDate } of USERS) {
        const birth = parseCalendarDate(birthDate)
        expect(birth, birthDate).not.toBeNull()
        const age = ageOn(birth, today)
        expect(age).toBeGreaterThanOrEqual(MIN_AGE)
        expect(age).toBeLessThanOrEqual(MAX_AGE)
      }
    })

    it('los intereses son de la lista cerrada y no pasan del máximo', () => {
      for (const { interests } of USERS) {
        expect(interests.length).toBeLessThanOrEqual(MAX_INTERESTS)
        for (const interest of interests) expect(INTERESTS).toContain(interest)
      }
    })

    it('el usuario Lucía tiene el perfil completo y el admin no necesita intereses', async () => {
      await run()
      const { userService } = buildTestModules()

      const lucia = await userService.getProfile((await User.findOne({ email: 'lucia@junte.test' }))._id.toString())

      expect(userService.isProfileComplete(lucia)).toBe(true)
      expect(fromUtcMidnight(lucia.birthDate).year).toBeLessThan(2010)
    })
  })
})
