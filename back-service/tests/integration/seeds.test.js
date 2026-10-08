import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { seed } from '../../seeds/seed.js'
import { User } from '../../src/modules/users/user.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { Participation } from '../../src/modules/participations/participation.model.js'

useTestDb()

const NOW = new Date('2026-10-07T12:00:00Z')

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
    await seed({ now: NOW })

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
    await seed({ now: NOW })
    const first = await snapshot()

    await seed({ now: NOW })

    expect(await snapshot()).toEqual(first)
  })

  it('participantCount coincide con las inscripciones activas', async () => {
    await seed({ now: NOW })
    await seed({ now: NOW })

    for (const plan of await Plan.find()) {
      const active = await Participation.countDocuments({ planId: plan._id, status: 'active' })
      expect(plan.participantCount).toBe(active)
      expect(plan.participantCount).toBeLessThanOrEqual(plan.capacity)
    }
  })
})
