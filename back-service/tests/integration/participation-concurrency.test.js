// Cupos bajo concurrencia (bloque "Cupos (concurrencia)" de docs/practicas/testing.md). El sprint 4 no se cierra
// sin estos tests: validan el resultado final contra MongoDB (replica set), con las transacciones reales.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { makePlan, makeUser } from '../helpers/factories.js'
import { buildTestModules } from '../helpers/modules.js'
import { Participation } from '../../src/modules/participations/participation.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'

useTestDb()

// Anterior a los planes de las factories (2030): todavía no empezaron.
const { participationService } = buildTestModules({ start: '2028-03-01T15:00:00Z' })

const makeUsers = (count) => Promise.all(Array.from({ length: count }, () => makeUser()))
const fulfilled = (results) => results.filter((result) => result.status === 'fulfilled')
const rejectedWith = (results, code) => results.filter((result) => result.reason?.code === code)

async function expectInvariant (planId) {
  const plan = await Plan.findById(planId)
  const active = await Participation.countDocuments({ planId, status: 'active' })
  expect(plan.participantCount).toBe(active)
  if (plan.capacity !== null) expect(plan.participantCount).toBeLessThanOrEqual(plan.capacity)
  return active
}

describe('inscripciones simultáneas', () => {
  it('no supera el cupo: con cupo 3 y 10 pedidos, 3 éxitos y 7 PLAN_FULL', async () => {
    const plan = await makePlan({ capacity: 3 })
    const users = await makeUsers(10)

    const results = await Promise.allSettled(users.map((user) => participationService.join({ planId: plan.id, userId: user.id })))

    expect(fulfilled(results)).toHaveLength(3)
    expect(rejectedWith(results, 'PLAN_FULL')).toHaveLength(7)
    expect((await Plan.findById(plan.id)).participantCount).toBe(3)
    expect(await Participation.countDocuments({ planId: plan.id, status: 'active' })).toBe(3)
  })

  it('con cupo ilimitado entran todos: 10 pedidos, 10 éxitos', async () => {
    const plan = await makePlan({ capacity: null })
    const users = await makeUsers(10)

    const results = await Promise.allSettled(users.map((user) => participationService.join({ planId: plan.id, userId: user.id })))

    expect(fulfilled(results)).toHaveLength(10)
    expect((await Plan.findById(plan.id)).participantCount).toBe(10)
    expect(await Participation.countDocuments({ planId: plan.id, status: 'active' })).toBe(10)
  })

  it('el mismo usuario dos veces en paralelo: 1 éxito, 1 ALREADY_JOINED y el contador sube 1', async () => {
    const plan = await makePlan({ capacity: 5 })
    const user = await makeUser()
    const join = () => participationService.join({ planId: plan.id, userId: user.id })

    const results = await Promise.allSettled([join(), join()])

    expect(fulfilled(results)).toHaveLength(1)
    expect(rejectedWith(results, 'ALREADY_JOINED')).toHaveLength(1)
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
    expect(await Participation.countDocuments({ planId: plan.id })).toBe(1)
  })

  it('reactivar la misma inscripción dos veces en paralelo tampoco duplica', async () => {
    const plan = await makePlan({ capacity: 5 })
    const user = await makeUser()
    await participationService.join({ planId: plan.id, userId: user.id })
    await participationService.leave({ planId: plan.id, userId: user.id })
    const join = () => participationService.join({ planId: plan.id, userId: user.id })

    const results = await Promise.allSettled([join(), join()])

    expect(fulfilled(results)).toHaveLength(1)
    expect(rejectedWith(results, 'ALREADY_JOINED')).toHaveLength(1)
    expect(await expectInvariant(plan.id)).toBe(1)
  })
})

describe('bajas', () => {
  it('la baja resta 1 y cancela el registro en la misma transacción', async () => {
    const plan = await makePlan({ capacity: 2 })
    const user = await makeUser()
    await participationService.join({ planId: plan.id, userId: user.id })

    const result = await participationService.leave({ planId: plan.id, userId: user.id })

    expect(result).toEqual({ left: true })
    expect((await Plan.findById(plan.id)).participantCount).toBe(0)
    expect(await Participation.findOne({ planId: plan.id, userId: user.id })).toMatchObject({ status: 'cancelled' })
  })

  it('si el plan ya no admite bajas, la transacción revierte la cancelación del registro', async () => {
    const plan = await makePlan({ capacity: 2 })
    const user = await makeUser()
    await participationService.join({ planId: plan.id, userId: user.id })
    await Plan.updateOne({ _id: plan.id }, { $set: { status: 'cancelled' } })

    await expect(participationService.leave({ planId: plan.id, userId: user.id })).rejects.toMatchObject({ code: 'PLAN_CLOSED' })

    expect(await Participation.findOne({ planId: plan.id, userId: user.id })).toMatchObject({ status: 'active' })
    expect((await Plan.findById(plan.id)).participantCount).toBe(1)
  })

  it('dos bajas simultáneas del mismo usuario restan una sola vez', async () => {
    const plan = await makePlan({ capacity: 5 })
    const [ana, beto] = await makeUsers(2)
    await participationService.join({ planId: plan.id, userId: ana.id })
    await participationService.join({ planId: plan.id, userId: beto.id })
    const leave = () => participationService.leave({ planId: plan.id, userId: ana.id })

    const results = await Promise.all([leave(), leave()])

    expect(results.filter((result) => result.left)).toHaveLength(1)
    expect(await expectInvariant(plan.id)).toBe(1)
  })

  it('altas y bajas mezcladas mantienen el contador igual a las inscripciones activas', async () => {
    const plan = await makePlan({ capacity: 4 })
    const users = await makeUsers(8)
    await Promise.all(users.slice(0, 4).map((user) => participationService.join({ planId: plan.id, userId: user.id })))

    await Promise.allSettled([
      ...users.slice(0, 3).map((user) => participationService.leave({ planId: plan.id, userId: user.id })),
      ...users.slice(4).map((user) => participationService.join({ planId: plan.id, userId: user.id }))
    ])

    await expectInvariant(plan.id)
  })
})
