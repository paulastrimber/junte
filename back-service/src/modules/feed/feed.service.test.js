import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { encodeCursor } from '../../shared/pagination.js'
import { buildScorers } from './feed.scorers.js'
import { MAX_CANDIDATES, createFeedService } from './feed.service.js'

const USER_ID = '665f1c2a9b1e8a0012345678'
const NEAR = [-56.1645, -34.9011]
const NOW = '2026-10-11T15:00:00Z'
const at = (iso) => new Date(iso)

const makePlan = (n, overrides = {}) => ({
  id: `plan-${String(n).padStart(3, '0')}`,
  interests: ['cine'],
  distanceMeters: n * 100,
  startsAt: at('2026-10-20T18:00:00Z'),
  endsAt: at('2026-10-20T20:00:00Z'),
  creatorId: 'creator',
  ...overrides
})

function setup ({ candidates = [], user = { id: USER_ID, interests: ['futbol'] }, joined = [], weights = { interests: 0.5, distance: 0.3, schedule: 0.2 } } = {}) {
  const clock = createFixedClock(NOW)
  const planRepo = {
    findNearby: vi.fn(async () => candidates),
    findSchedulesByIds: vi.fn(async () => joined)
  }
  const userRepo = { findById: vi.fn(async () => user) }
  const participationRepo = { findActivePlanIds: vi.fn(async () => joined.map((plan) => plan.id)) }
  const attachCreators = vi.fn(async (plans) => plans.map((plan) => ({ plan, creator: null })))
  const service = createFeedService({ planRepo, userRepo, participationRepo, attachCreators, scorers: buildScorers(weights), clock })
  const recommend = (params = {}) => service.recommend({ userId: USER_ID, near: NEAR, filters: { availability: 'available' }, limit: 20, ...params })
  const ids = (page) => page.items.map(({ plan }) => plan.id)
  return { service, recommend, ids, planRepo, userRepo, participationRepo, clock }
}

describe('recommend', () => {
  it('pide los candidatos dentro del radio (10 km por defecto), con el tope y a la hora del reloj', async () => {
    const { recommend, planRepo } = setup()

    await recommend({ filters: { availability: 'available', university: 'um' } })

    expect(planRepo.findNearby).toHaveBeenCalledWith({
      near: NEAR,
      maxDistanceMeters: 10_000,
      filters: { availability: 'available', university: 'um' },
      asOf: at(NOW),
      limit: MAX_CANDIDATES,
      exclude: { creatorId: USER_ID, planIds: [] }
    })
  })

  it('excluye de los candidatos los planes propios y aquellos en los que ya está inscripto', async () => {
    const { recommend, planRepo } = setup({ joined: [makePlan(7), makePlan(8)] })

    await recommend()

    expect(planRepo.findNearby).toHaveBeenCalledWith(expect.objectContaining({ exclude: { creatorId: USER_ID, planIds: ['plan-007', 'plan-008'] } }))
  })

  it('respeta el radio pedido', async () => {
    const { recommend, planRepo } = setup()

    await recommend({ radiusKm: 2.5 })

    expect(planRepo.findNearby).toHaveBeenCalledWith(expect.objectContaining({ maxDistanceMeters: 2_500 }))
  })

  it('ordena por recomendación: mismos intereses y cerca queda primero, aunque no sea el más cercano', async () => {
    const closestButUnrelated = makePlan(1)
    const matching = makePlan(2, { interests: ['futbol'] })
    const far = makePlan(90)
    const { recommend, ids } = setup({ candidates: [closestButUnrelated, matching, far] })

    expect(ids(await recommend())).toEqual([matching.id, closestButUnrelated.id, far.id])
  })

  it('cambiar los pesos en la configuración cambia el orden', async () => {
    const candidates = [makePlan(1), makePlan(2, { interests: ['futbol'] })]
    const byDistance = setup({ candidates, weights: { interests: 0, distance: 1, schedule: 0 } })
    const byInterests = setup({ candidates, weights: { interests: 1, distance: 0, schedule: 0 } })

    expect(byDistance.ids(await byDistance.recommend())).toEqual(['plan-001', 'plan-002'])
    expect(byInterests.ids(await byInterests.recommend())).toEqual(['plan-002', 'plan-001'])
  })

  it('si el usuario ya no existe responde 401', async () => {
    const { recommend } = setup({ user: null })

    await expect(recommend()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  describe('compatibilidad horaria', () => {
    const calendar = (busy = []) => ({ from: at('2026-10-11T00:00:00Z'), to: at('2026-11-10T00:00:00Z'), busy })
    const scheduleOnly = { interests: 0, distance: 0, schedule: 1 }

    it('con el calendario de la app, un plan que se superpone con una franja ocupada baja en el ranking', async () => {
      const overlapping = makePlan(1)
      const free = makePlan(2, { startsAt: at('2026-10-22T18:00:00Z'), endsAt: at('2026-10-22T20:00:00Z') })
      const { recommend, ids } = setup({ candidates: [overlapping, free], weights: scheduleOnly })

      const page = await recommend({ calendar: calendar([{ start: at('2026-10-20T19:00:00Z'), end: at('2026-10-20T19:30:00Z') }]) })

      expect(ids(page)).toEqual([free.id, overlapping.id])
    })

    it('sin calendario cuentan igual los planes en los que ya está inscripto', async () => {
      const overlapping = makePlan(1)
      const free = makePlan(2, { startsAt: at('2026-10-22T18:00:00Z'), endsAt: at('2026-10-22T20:00:00Z') })
      const joined = [{ id: 'plan-999', startsAt: at('2026-10-20T19:00:00Z'), endsAt: at('2026-10-20T21:00:00Z') }]
      const { recommend, ids, planRepo } = setup({ candidates: [overlapping, free], joined, weights: scheduleOnly })

      const page = await recommend()

      expect(ids(page)).toEqual([free.id, overlapping.id])
      expect(planRepo.findSchedulesByIds).toHaveBeenCalledWith(['plan-999'], { endsAfter: at(NOW) })
    })
  })

  describe('paginación', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => makePlan(i + 1))

    it('recorre el ranking sin duplicados ni saltos y termina con nextCursor null', async () => {
      const { recommend, ids } = setup({ candidates })

      const first = await recommend({ limit: 2 })
      const second = await recommend({ limit: 2, cursor: first.nextCursor })
      const third = await recommend({ limit: 2, cursor: second.nextCursor })

      expect([...ids(first), ...ids(second), ...ids(third)]).toEqual(['plan-001', 'plan-002', 'plan-003', 'plan-004', 'plan-005'])
      expect(first.nextCursor).toEqual(expect.any(String))
      expect(third.nextCursor).toBeNull()
    })

    it('una página exacta no deja un cursor a una página vacía', async () => {
      const { recommend } = setup({ candidates: candidates.slice(0, 2) })

      expect((await recommend({ limit: 2 })).nextCursor).toBeNull()
    })

    it('las páginas siguientes usan el instante de la primera (el conjunto de candidatos no cambia)', async () => {
      const { recommend, planRepo, clock } = setup({ candidates })
      const first = await recommend({ limit: 2 })
      clock.advance(5 * 60 * 1000)

      await recommend({ limit: 2, cursor: first.nextCursor })

      expect(planRepo.findNearby).toHaveBeenLastCalledWith(expect.objectContaining({ asOf: at(NOW) }))
    })

    it('un cursor de otra búsqueda (otro radio, otros filtros u otra posición) → 400', async () => {
      const { recommend } = setup({ candidates })
      const { nextCursor } = await recommend({ limit: 2 })

      await expect(recommend({ limit: 2, cursor: nextCursor, radiusKm: 5 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
      await expect(recommend({ limit: 2, cursor: nextCursor, filters: { availability: 'full' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
      await expect(recommend({ limit: 2, cursor: nextCursor, near: [-56.2, -34.9] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it.each([
      ['basura', 'no-es-un-cursor'],
      ['otra forma', encodeCursor({ s: 1, i: '665f1c2a9b1e8a0012345678' })],
      ['posición negativa', encodeCursor({ o: -1, t: 0, f: '0'.repeat(16) })],
      ['posición fuera del tope', encodeCursor({ o: MAX_CANDIDATES + 1, t: 0, f: '0'.repeat(16) })]
    ])('un cursor manipulado (%s) → 400, nunca un error interno', async (_label, cursor) => {
      const { recommend } = setup({ candidates })

      await expect(recommend({ cursor })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    })
  })
})
