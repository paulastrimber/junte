// Cierre de asistencia y de planes (S4-BE-07): `noShow`, +1 del creador y `completed`, contra MongoDB real.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { makeParticipation, makePlan, makeUser } from '../helpers/factories.js'
import { buildTestModules } from '../helpers/modules.js'
import { CheckIn } from '../../src/modules/checkins/checkin.model.js'
import { Participation } from '../../src/modules/participations/participation.model.js'
import { Plan } from '../../src/modules/plans/plan.model.js'
import { User } from '../../src/modules/users/user.model.js'

useTestDb()

const MINUTE_MS = 60 * 1000
// Planes de las factories: empiezan el 2030-01-01 18:00 UTC y duran 2 h → la ventana cierra a las 19:00.
const STARTS_AT = new Date(Date.UTC(2030, 0, 1, 18))
const WINDOW_CLOSES_AT = new Date(STARTS_AT.getTime() + 60 * MINUTE_MS)
const ENDS_AT = new Date(STARTS_AT.getTime() + 120 * MINUTE_MS)
const AFTER_WINDOW = new Date(WINDOW_CLOSES_AT.getTime() + 1000)

const { attendanceService, clock } = buildTestModules()

const reputationOf = async (user) => (await User.findById(user._id)).reputation
const participationOf = (plan, user) => Participation.findOne({ planId: plan._id, userId: user._id }).lean()

async function enroll (plan, user, { checkedIn = false, method = 'qr-location', ...overrides } = {}) {
  await makeParticipation({ planId: plan._id, userId: user._id, ...overrides })
  if (checkedIn) await CheckIn.create({ planId: plan._id, userId: user._id, checkedInAt: STARTS_AT, method, distanceMeters: 10, accuracyMeters: 5 })
}

/** Un plan con `present` inscriptos que hicieron check-in y `absent` que no. */
async function planWithAttendance ({ present = 0, absent = 0, ...overrides } = {}) {
  const plan = await makePlan(overrides)
  const attendees = await Promise.all(Array.from({ length: present }, () => makeUser()))
  const missing = await Promise.all(Array.from({ length: absent }, () => makeUser()))
  for (const user of attendees) await enroll(plan, user, { checkedIn: true })
  for (const user of missing) await enroll(plan, user)
  await Plan.updateOne({ _id: plan._id }, { $set: { participantCount: present + absent } })
  return { plan, attendees, missing }
}

describe('cierre de asistencia (al cerrar la ventana de check-in)', () => {
  it('marca noShow solo en las inscripciones activas sin check-in', async () => {
    const { plan, attendees, missing } = await planWithAttendance({ present: 1, absent: 2 })
    const cancelled = await makeUser()
    await enroll(plan, cancelled, { status: 'cancelled', cancelledAt: new Date(Date.UTC(2029, 11, 20)) })
    clock.set(AFTER_WINDOW)

    const processed = await attendanceService.closeDueAttendance()

    expect(processed).toBe(1)
    for (const user of missing) expect(await participationOf(plan, user)).toMatchObject({ noShow: true, noShowAt: AFTER_WINDOW })
    expect(await participationOf(plan, attendees[0])).toMatchObject({ noShow: false })
    expect(await participationOf(plan, cancelled)).toMatchObject({ status: 'cancelled', noShow: false })
    expect((await Plan.findById(plan._id)).attendanceClosedAt).toEqual(AFTER_WINDOW)
  })

  it('noShow no resta reputación', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1 })
    await User.updateOne({ _id: missing[0]._id }, { $set: { reputation: 3 } })
    clock.set(AFTER_WINDOW)

    await attendanceService.closeDueAttendance()

    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: true })
    expect(await reputationOf(missing[0])).toBe(3)
  })

  it('no hace nada mientras la ventana sigue abierta (incluido el instante exacto en que cierra)', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1 })
    clock.set(WINDOW_CLOSES_AT)

    expect(await attendanceService.closeDueAttendance()).toBe(0)
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: false })
    expect((await Plan.findById(plan._id)).attendanceClosedAt).toBeUndefined()
  })

  it('cerrar inscripciones (status closed) no marca noShow; el job lo hace igual cuando cierra la ventana', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1, status: 'closed' })
    clock.set(new Date(STARTS_AT.getTime() - 60 * MINUTE_MS))

    expect(await attendanceService.closeDueAttendance()).toBe(0)
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: false })

    clock.set(AFTER_WINDOW)
    expect(await attendanceService.closeDueAttendance()).toBe(1)
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: true })
  })

  it('los planes cancelados no se procesan', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1, status: 'cancelled' })
    clock.set(AFTER_WINDOW)

    expect(await attendanceService.closeDueAttendance()).toBe(0)
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: false })
  })

  it('corre una sola vez por plan: una segunda pasada no cambia nada', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1 })
    clock.set(AFTER_WINDOW)
    await attendanceService.closeDueAttendance()
    clock.advance(5 * MINUTE_MS)

    expect(await attendanceService.closeDueAttendance()).toBe(0)
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShowAt: AFTER_WINDOW })
  })

  it('dos instancias a la vez: solo una cierra la asistencia', async () => {
    const creator = await makeUser()
    const { plan } = await planWithAttendance({ present: 2, absent: 1, creatorId: creator._id })
    await enroll(plan, creator, { checkedIn: true, method: 'location' })
    clock.set(AFTER_WINDOW)

    const results = await Promise.all([attendanceService.closeAttendance(plan.id), attendanceService.closeAttendance(plan.id)])

    expect(results.filter((result) => result !== null)).toEqual([{ noShows: 1, creatorRewarded: true }])
    expect(await reputationOf(creator)).toBe(1)
  })
})

describe('reputación del creador (al cerrar la asistencia)', () => {
  async function creatorScenario ({ others, creatorCheckedIn = true }) {
    const creator = await makeUser()
    const { plan } = await planWithAttendance({ present: others, creatorId: creator._id })
    await enroll(plan, creator, { checkedIn: creatorCheckedIn, method: 'location' })
    clock.set(AFTER_WINDOW)
    await attendanceService.closeDueAttendance()
    return { plan, creator }
  }

  it('+1 si hizo check-in y al menos 2 participantes más también', async () => {
    const { creator } = await creatorScenario({ others: 2 })

    expect(await reputationOf(creator)).toBe(1)
  })

  it('no suma si solo 1 participante más hizo check-in (el creador no cuenta para el mínimo)', async () => {
    const { plan, creator } = await creatorScenario({ others: 1 })

    expect(await reputationOf(creator)).toBe(0)
    expect(await participationOf(plan, creator)).toMatchObject({ noShow: false })
  })

  it('si el creador inscripto no hizo check-in no suma y se le marca noShow como a cualquiera', async () => {
    const { plan, creator } = await creatorScenario({ others: 3, creatorCheckedIn: false })

    expect(await reputationOf(creator)).toBe(0)
    expect(await participationOf(plan, creator)).toMatchObject({ noShow: true })
  })

  it('un creador que no se inscribió no recibe nada ni queda como ausente', async () => {
    const creator = await makeUser()
    const { plan } = await planWithAttendance({ present: 3, creatorId: creator._id })
    clock.set(AFTER_WINDOW)

    await attendanceService.closeDueAttendance()

    expect(await reputationOf(creator)).toBe(0)
    expect(await participationOf(plan, creator)).toBeNull()
  })
})

describe('completar planes (al llegar endsAt)', () => {
  it('pasa a completed los planes abiertos o cerrados que ya terminaron', async () => {
    const open = await makePlan()
    const closed = await makePlan({ status: 'closed' })
    const cancelled = await makePlan({ status: 'cancelled' })
    const future = await makePlan({ startsAt: new Date(Date.UTC(2030, 0, 2, 18)) })
    clock.set(ENDS_AT)

    const processed = await attendanceService.completeDuePlans()

    expect(processed).toBe(2)
    expect((await Plan.findById(open._id)).status).toBe('completed')
    expect((await Plan.findById(closed._id)).status).toBe('completed')
    expect((await Plan.findById(cancelled._id)).status).toBe('cancelled')
    expect((await Plan.findById(future._id)).status).toBe('open')
  })

  it('no completa un plan que cerró la ventana de check-in pero todavía no terminó', async () => {
    const plan = await makePlan()
    clock.set(new Date(ENDS_AT.getTime() - 1000))

    expect(await attendanceService.completeDuePlans()).toBe(0)
    expect((await Plan.findById(plan._id)).status).toBe('open')
  })

  it('si el cierre de asistencia no había corrido, lo hace en la misma operación', async () => {
    const { plan, missing } = await planWithAttendance({ absent: 1 })
    clock.set(ENDS_AT)

    await attendanceService.completeDuePlans()

    expect(await Plan.findById(plan._id)).toMatchObject({ status: 'completed', attendanceClosedAt: ENDS_AT })
    expect(await participationOf(plan, missing[0])).toMatchObject({ noShow: true })
  })

  it('un plan ya completado no vuelve a marcar noShow ni a premiar al creador', async () => {
    const creator = await makeUser()
    const { plan } = await planWithAttendance({ present: 2, creatorId: creator._id })
    await enroll(plan, creator, { checkedIn: true, method: 'location' })
    clock.set(AFTER_WINDOW)
    await attendanceService.closeDueAttendance()
    clock.set(ENDS_AT)

    await attendanceService.completeDuePlans()
    await attendanceService.closeDueAttendance()

    expect((await Plan.findById(plan._id)).status).toBe('completed')
    expect(await reputationOf(creator)).toBe(1)
  })
})
