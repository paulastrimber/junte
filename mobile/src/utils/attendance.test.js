import { formatNoShows, formatReputation, looksLikeQrToken, planActions, qrRefreshDelay } from './attendance.js'

const NOW = new Date('2026-10-25T21:00:00.000Z')
const MINUTE_MS = 60 * 1000
const at = (minutes) => new Date(NOW.getTime() + minutes * MINUTE_MS).toISOString()

/** Un plan que empieza `startsIn` minutos después de NOW y dura dos horas. */
const plan = ({ startsIn = 24 * 60, ...overrides } = {}) => ({
  status: 'open',
  isFull: false,
  isCreator: false,
  startsAt: at(startsIn),
  endsAt: at(startsIn + 120),
  checkInOpensAt: at(startsIn - 15),
  checkInClosesAt: at(startsIn + 60),
  myParticipation: null,
  ...overrides
})
const joined = (extra = {}) => ({ status: 'active', checkedInAt: null, noShow: false, ...extra })

describe('planActions', () => {
  it('plan abierto con lugar y sin inscripción: se puede inscribir', () => {
    expect(planActions(plan(), NOW)).toMatchObject({ canJoin: true, canLeave: false, isJoined: false, canSeeParticipants: false })
  })

  it.each([
    ['lleno', { isFull: true }],
    ['con las inscripciones cerradas', { status: 'closed' }],
    ['cancelado', { status: 'cancelled' }],
    ['que ya empezó', { startsIn: 0 }]
  ])('no se puede inscribir en un plan %s', (_label, overrides) => {
    expect(planActions(plan(overrides), NOW).canJoin).toBe(false)
  })

  it('quien se dio de baja puede volver a inscribirse', () => {
    expect(planActions(plan({ myParticipation: joined({ status: 'cancelled' }) }), NOW)).toMatchObject({ canJoin: true, isJoined: false })
  })

  it('inscripto antes de que empiece: puede darse de baja (también con las inscripciones cerradas) y ve quiénes van', () => {
    expect(planActions(plan({ myParticipation: joined() }), NOW)).toMatchObject({ canJoin: false, canLeave: true, canSeeParticipants: true })
    expect(planActions(plan({ status: 'closed', myParticipation: joined() }), NOW).canLeave).toBe(true)
  })

  it('no hay baja con el plan empezado, cancelado o con la asistencia registrada', () => {
    expect(planActions(plan({ startsIn: 0, myParticipation: joined() }), NOW).canLeave).toBe(false)
    expect(planActions(plan({ status: 'cancelled', myParticipation: joined() }), NOW).canLeave).toBe(false)
    expect(planActions(plan({ startsIn: 10, myParticipation: joined({ checkedInAt: at(-1) }) }), NOW).canLeave).toBe(false)
  })

  it('la asistencia se ofrece solo dentro del horario (bordes incluidos) y una sola vez', () => {
    const during = planActions(plan({ startsIn: 15, myParticipation: joined() }), NOW)
    const closing = planActions(plan({ startsIn: -60, myParticipation: joined() }), NOW)
    const before = planActions(plan({ startsIn: 16, myParticipation: joined() }), NOW)
    const after = planActions(plan({ startsIn: -61, myParticipation: joined() }), NOW)
    const done = planActions(plan({ startsIn: 0, myParticipation: joined({ checkedInAt: at(-1) }) }), NOW)

    expect(during.canCheckIn).toBe(true)
    expect(closing.canCheckIn).toBe(true)
    expect(before.canCheckIn).toBe(false)
    expect(after.canCheckIn).toBe(false)
    expect(done).toMatchObject({ canCheckIn: false, hasCheckedIn: true })
  })

  it('el creador muestra el QR en horario; no escanea, y registra la suya solo si está inscripto', () => {
    const notJoined = planActions(plan({ startsIn: 0, isCreator: true }), NOW)
    const enrolled = planActions(plan({ startsIn: 0, isCreator: true, myParticipation: joined() }), NOW)

    expect(notJoined).toMatchObject({ canShowQr: true, canCheckIn: false, canCreatorCheckIn: false, canSeeParticipants: true })
    expect(enrolled).toMatchObject({ canShowQr: true, canCheckIn: false, canCreatorCheckIn: true })
    expect(planActions(plan({ isCreator: true }), NOW).canShowQr).toBe(false)
    expect(planActions(plan({ startsIn: 0, isCreator: true, status: 'cancelled' }), NOW).canShowQr).toBe(false)
  })

  it('el creador cierra o reabre antes de empezar, y cancela hasta que termina', () => {
    expect(planActions(plan({ isCreator: true }), NOW)).toMatchObject({ canCloseSignUps: true, canReopenSignUps: false, canCancel: true })
    expect(planActions(plan({ isCreator: true, status: 'closed' }), NOW)).toMatchObject({ canCloseSignUps: false, canReopenSignUps: true })
    expect(planActions(plan({ isCreator: true, startsIn: -30 }), NOW)).toMatchObject({ canCloseSignUps: false, canCancel: true })
    expect(planActions(plan({ isCreator: true, startsIn: -120 }), NOW).canCancel).toBe(false)
    expect(planActions(plan({ isCreator: true, status: 'cancelled' }), NOW).canCancel).toBe(false)
    expect(planActions(plan(), NOW)).toMatchObject({ canCloseSignUps: false, canCancel: false })
  })

  it('informa la ausencia', () => {
    expect(planActions(plan({ startsIn: -180, status: 'completed', myParticipation: joined({ noShow: true }) }), NOW).wasNoShow).toBe(true)
  })
})

describe('planActions: chat', () => {
  it('lo ven el creador y quienes están anotados', () => {
    expect(planActions(plan({ isCreator: true }), NOW).canChat).toBe(true)
    expect(planActions(plan({ myParticipation: joined() }), NOW).canChat).toBe(true)
  })

  it('no lo ven quienes no participan ni quienes se dieron de baja', () => {
    expect(planActions(plan(), NOW).canChat).toBe(false)
    expect(planActions(plan({ myParticipation: joined({ status: 'cancelled' }) }), NOW).canChat).toBe(false)
  })
})

describe('qrRefreshDelay', () => {
  it('15 segundos antes de que venza, con un mínimo de 5 segundos', () => {
    expect(qrRefreshDelay(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe(75_000)
    expect(qrRefreshDelay(new Date(NOW.getTime() + 10_000).toISOString(), NOW)).toBe(5_000)
    expect(qrRefreshDelay(new Date(NOW.getTime() - 60_000).toISOString(), NOW)).toBe(5_000)
  })
})

describe('textos', () => {
  it('looksLikeQrToken: texto corto y no vacío', () => {
    expect(looksLikeQrToken('665f1c2a9b1e8a0012345678.abc')).toBe(true)
    expect(looksLikeQrToken('')).toBe(false)
    expect(looksLikeQrToken('x'.repeat(201))).toBe(false)
    expect(looksLikeQrToken(undefined)).toBe(false)
  })

  it('reputación y ausencias en singular y plural', () => {
    expect([0, 1, 4].map(formatReputation)).toEqual(['0 asistencias', '1 asistencia', '4 asistencias'])
    expect([0, 1, 3].map(formatNoShows)).toEqual(['Sin ausencias', '1 ausencia', '3 ausencias'])
  })
})
