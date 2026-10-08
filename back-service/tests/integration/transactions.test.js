import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { makeParticipation, makePlan, makeUser } from '../helpers/factories.js'
import { withTransaction } from '../../src/adapters/db/index.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { Participation } from '../../src/modules/participations/participation.model.js'

useTestDb()

// Patrón de inscripción de 07: $inc condicional + registro, en la misma sesión.
async function joinInSession (session, { planId, userId }) {
  const plan = await Plan.findOneAndUpdate(
    { _id: planId, status: 'open', $expr: { $lt: ['$participantCount', '$capacity'] } },
    { $inc: { participantCount: 1 } },
    { returnDocument: 'after', session }
  )
  await Participation.create([{ planId, userId, status: 'active', joinedAt: new Date() }], { session })
  return plan
}

describe('withTransaction', () => {
  it('confirma los cambios y devuelve lo que devuelve fn', async () => {
    const plan = await makePlan({ capacity: 3 })
    const user = await makeUser()

    const result = await withTransaction((session) => joinInSession(session, { planId: plan._id, userId: user._id }))

    expect(result.participantCount).toBe(1)
    expect((await Plan.findById(plan._id)).participantCount).toBe(1)
    expect(await Participation.countDocuments({ planId: plan._id, status: 'active' })).toBe(1)
  })

  it('una transacción abortada no deja cambios en ninguna colección', async () => {
    const plan = await makePlan({ capacity: 3 })
    const user = await makeUser()

    const attempt = withTransaction(async (session) => {
      await joinInSession(session, { planId: plan._id, userId: user._id })
      throw new Error('falla después de escribir')
    })

    await expect(attempt).rejects.toThrow('falla después de escribir')
    expect((await Plan.findById(plan._id)).participantCount).toBe(0)
    expect(await Participation.countDocuments({ planId: plan._id })).toBe(0)
  })

  it('un E11000 dentro de la transacción revierte el $inc del cupo', async () => {
    const plan = await makePlan({ capacity: 3 })
    const user = await makeUser()
    await makeParticipation({ planId: plan._id, userId: user._id })

    const attempt = withTransaction((session) => joinInSession(session, { planId: plan._id, userId: user._id }))

    await expect(attempt).rejects.toMatchObject({ code: 11000 })
    expect((await Plan.findById(plan._id)).participantCount).toBe(0)
    expect(await Participation.countDocuments({ planId: plan._id })).toBe(1)
  })
})
