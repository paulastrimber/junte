import { describe, expect, it } from 'vitest'
import { buildScorers, interestScorer, jaccard, overlaps, proximityScorer, rankPlans, scheduleScorer } from './feed.scorers.js'

const at = (iso) => new Date(iso)

let sequence = 0
const makePlan = (overrides = {}) => ({
  id: `plan-${String(++sequence).padStart(3, '0')}`,
  interests: ['futbol'],
  distanceMeters: 1000,
  startsAt: at('2026-10-20T18:00:00Z'),
  endsAt: at('2026-10-20T20:00:00Z'),
  ...overrides
})

const makeCtx = (overrides = {}) => ({
  userInterests: ['futbol'], radiusMeters: 10_000, busy: [], calendarWindow: null, ...overrides
})

describe('jaccard', () => {
  it('conjuntos iguales → 1', () => {
    expect(jaccard(['futbol', 'cine'], ['cine', 'futbol'])).toBe(1)
  })

  it('sin elementos en común → 0', () => {
    expect(jaccard(['futbol'], ['cine'])).toBe(0)
  })

  it('intersección sobre unión', () => {
    expect(jaccard(['futbol', 'cine'], ['cine', 'yoga'])).toBeCloseTo(1 / 3)
    expect(jaccard(['futbol'], ['futbol', 'cine'])).toBe(0.5)
  })

  it('dos conjuntos vacíos → 0 (no divide por cero)', () => {
    expect(jaccard([], [])).toBe(0)
    expect(jaccard(['futbol'], [])).toBe(0)
  })

  it('los repetidos no cuentan dos veces', () => {
    expect(jaccard(['futbol', 'futbol'], ['futbol'])).toBe(1)
  })
})

describe('interestScorer', () => {
  it('usa los intereses del usuario y los del plan', () => {
    expect(interestScorer(makePlan({ interests: ['futbol', 'cine'] }), makeCtx({ userInterests: ['futbol'] }))).toBe(0.5)
  })

  it('un plan sin intereses puntúa 0', () => {
    expect(interestScorer(makePlan({ interests: undefined }), makeCtx())).toBe(0)
  })
})

describe('proximityScorer', () => {
  it('1 en distancia 0, lineal hasta 0 en el borde del radio', () => {
    const ctx = makeCtx({ radiusMeters: 10_000 })

    expect(proximityScorer(makePlan({ distanceMeters: 0 }), ctx)).toBe(1)
    expect(proximityScorer(makePlan({ distanceMeters: 2_500 }), ctx)).toBe(0.75)
    expect(proximityScorer(makePlan({ distanceMeters: 5_000 }), ctx)).toBe(0.5)
    expect(proximityScorer(makePlan({ distanceMeters: 10_000 }), ctx)).toBe(0)
  })

  it('nunca sale de [0, 1]', () => {
    expect(proximityScorer(makePlan({ distanceMeters: 15_000 }), makeCtx({ radiusMeters: 10_000 }))).toBe(0)
  })
})

describe('overlaps', () => {
  it('intervalos que se tocan en el borde no se superponen', () => {
    expect(overlaps(at('2026-10-20T18:00:00Z'), at('2026-10-20T20:00:00Z'), at('2026-10-20T20:00:00Z'), at('2026-10-20T21:00:00Z'))).toBe(false)
    expect(overlaps(at('2026-10-20T18:00:00Z'), at('2026-10-20T20:00:00Z'), at('2026-10-20T19:59:00Z'), at('2026-10-20T21:00:00Z'))).toBe(true)
  })
})

describe('scheduleScorer', () => {
  const window = { from: at('2026-10-11T00:00:00Z'), to: at('2026-11-10T00:00:00Z') }
  const busyDuring = { start: at('2026-10-20T19:00:00Z'), end: at('2026-10-20T19:30:00Z') }
  const busyElsewhere = { start: at('2026-10-21T19:00:00Z'), end: at('2026-10-21T20:00:00Z') }

  it('sin calendario (sin permiso) → 0.5 neutral', () => {
    expect(scheduleScorer(makePlan(), makeCtx())).toBe(0.5)
  })

  it('con calendario y sin superposición → 1', () => {
    expect(scheduleScorer(makePlan(), makeCtx({ calendarWindow: window, busy: [busyElsewhere] }))).toBe(1)
  })

  it('con superposición → 0', () => {
    expect(scheduleScorer(makePlan(), makeCtx({ calendarWindow: window, busy: [busyDuring] }))).toBe(0)
  })

  it('un plan fuera del período leído del calendario → 0.5 (no se sabe)', () => {
    const later = makePlan({ startsAt: at('2026-12-01T18:00:00Z'), endsAt: at('2026-12-01T20:00:00Z') })
    const straddling = makePlan({ startsAt: at('2026-11-09T23:00:00Z'), endsAt: at('2026-11-10T01:00:00Z') })

    expect(scheduleScorer(later, makeCtx({ calendarWindow: window }))).toBe(0.5)
    expect(scheduleScorer(straddling, makeCtx({ calendarWindow: window }))).toBe(0.5)
  })

  it('un plan en el que ya está inscripto ocupa ese horario aunque no haya permiso de calendario', () => {
    const joined = { planId: 'otro-plan', start: at('2026-10-20T17:00:00Z'), end: at('2026-10-20T18:30:00Z') }

    expect(scheduleScorer(makePlan(), makeCtx({ busy: [joined] }))).toBe(0)
  })

  it('un plan no se superpone consigo mismo (el usuario ya está inscripto en él)', () => {
    const plan = makePlan()
    const itself = { planId: plan.id, start: plan.startsAt, end: plan.endsAt }

    expect(scheduleScorer(plan, makeCtx({ busy: [itself] }))).toBe(0.5)
    expect(scheduleScorer(plan, makeCtx({ busy: [itself], calendarWindow: window }))).toBe(1)
  })
})

describe('rankPlans', () => {
  const weights = { interests: 0.5, distance: 0.3, schedule: 0.2 }

  it('el plan con los mismos intereses y cerca queda primero', () => {
    const farAndUnrelated = makePlan({ interests: ['cine'], distanceMeters: 9_000 })
    const nearButUnrelated = makePlan({ interests: ['cine'], distanceMeters: 100 })
    const nearAndMatching = makePlan({ interests: ['futbol'], distanceMeters: 200 })

    const ranked = rankPlans([farAndUnrelated, nearButUnrelated, nearAndMatching], makeCtx(), buildScorers(weights))

    expect(ranked.map(({ plan }) => plan.id)).toEqual([nearAndMatching.id, nearButUnrelated.id, farAndUnrelated.id])
  })

  it('el score es la suma ponderada de los criterios', () => {
    const plan = makePlan({ interests: ['futbol', 'cine'], distanceMeters: 5_000 })

    const [{ score }] = rankPlans([plan], makeCtx({ userInterests: ['futbol'] }), buildScorers(weights))

    expect(score).toBeCloseTo(0.5 * 0.5 + 0.3 * 0.5 + 0.2 * 0.5)
  })

  it('cambiar los pesos cambia el orden sin tocar código', () => {
    const matchingButFar = makePlan({ interests: ['futbol'], distanceMeters: 9_000 })
    const unrelatedButNear = makePlan({ interests: ['cine'], distanceMeters: 100 })
    const order = (w) => rankPlans([matchingButFar, unrelatedButNear], makeCtx(), buildScorers(w)).map(({ plan }) => plan.id)

    expect(order({ interests: 0.5, distance: 0.3, schedule: 0.2 })).toEqual([matchingButFar.id, unrelatedButNear.id])
    expect(order({ interests: 0.1, distance: 0.8, schedule: 0.1 })).toEqual([unrelatedButNear.id, matchingButFar.id])
  })

  it('empates: primero el más cercano, después el que empieza antes y por último el id (orden determinista)', () => {
    const base = { interests: ['cine'], distanceMeters: 500 }
    const later = makePlan({ ...base, startsAt: at('2026-10-21T18:00:00Z'), endsAt: at('2026-10-21T20:00:00Z') })
    const sooner = makePlan({ ...base })
    const twin = makePlan({ ...base })
    const scorers = buildScorers({ interests: 1, distance: 0, schedule: 0 })

    const forwards = rankPlans([later, twin, sooner], makeCtx(), scorers).map(({ plan }) => plan.id)
    const backwards = rankPlans([sooner, twin, later], makeCtx(), scorers).map(({ plan }) => plan.id)

    expect(forwards).toEqual([sooner.id, twin.id, later.id])
    expect(backwards).toEqual(forwards)
  })

  it('no modifica la lista de candidatos', () => {
    const candidates = [makePlan({ distanceMeters: 900 }), makePlan({ distanceMeters: 100 })]
    const original = [...candidates]

    rankPlans(candidates, makeCtx(), buildScorers(weights))

    expect(candidates).toEqual(original)
  })
})
