import { describe, expect, it } from 'vitest'
import { PLAN_LIMITS, PRICE_RANGES, availableSpots, checkSchedule, isFull, isPubliclyVisible } from './plan.rules.js'

const at = (iso) => new Date(iso)
const NOW = at('2026-10-11T15:00:00Z')

describe('checkSchedule', () => {
  const check = (startsAt, endsAt, mustStartInFuture = true) => checkSchedule({ startsAt: at(startsAt), endsAt: at(endsAt), now: NOW, mustStartInFuture })
  const paths = (details) => details.map((detail) => detail.path)

  it('un plan futuro que termina después de empezar es válido', () => {
    expect(check('2026-10-12T18:00:00Z', '2026-10-12T20:00:00Z')).toEqual([])
  })

  it('tiene que empezar en el futuro (solo cuando se pide)', () => {
    expect(paths(check('2026-10-11T15:00:00Z', '2026-10-11T17:00:00Z'))).toEqual(['startsAt'])
    expect(check('2026-10-11T14:00:00Z', '2026-10-11T17:00:00Z', false)).toEqual([])
  })

  it('tiene que terminar después de empezar', () => {
    expect(paths(check('2026-10-12T18:00:00Z', '2026-10-12T18:00:00Z'))).toEqual(['endsAt'])
    expect(paths(check('2026-10-12T18:00:00Z', '2026-10-12T17:00:00Z'))).toEqual(['endsAt'])
  })

  it('dura como máximo 7 días (borde incluido)', () => {
    expect(check('2026-10-12T18:00:00Z', '2026-10-19T18:00:00Z')).toEqual([])
    expect(paths(check('2026-10-12T18:00:00Z', '2026-10-19T18:00:01Z'))).toEqual(['endsAt'])
    expect(PLAN_LIMITS.MAX_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('informa todos los problemas a la vez', () => {
    expect(paths(check('2026-10-10T18:00:00Z', '2026-10-10T17:00:00Z'))).toEqual(['startsAt', 'endsAt'])
  })
})

describe('isPubliclyVisible', () => {
  const plan = (overrides = {}) => ({ status: 'open', endsAt: at('2026-10-11T16:00:00Z'), ...overrides })

  it('abierto o cerrado y sin terminar → visible', () => {
    expect(isPubliclyVisible(plan(), NOW)).toBe(true)
    expect(isPubliclyVisible(plan({ status: 'closed' }), NOW)).toBe(true)
  })

  it('cancelado, completado o ya terminado → no visible', () => {
    expect(isPubliclyVisible(plan({ status: 'cancelled' }), NOW)).toBe(false)
    expect(isPubliclyVisible(plan({ status: 'completed' }), NOW)).toBe(false)
    expect(isPubliclyVisible(plan({ endsAt: NOW }), NOW)).toBe(false)
  })
})

describe('cupo: isFull y availableSpots', () => {
  it('"lleno" se calcula: participantCount >= capacity', () => {
    expect(isFull({ capacity: 3, participantCount: 2 })).toBe(false)
    expect(isFull({ capacity: 3, participantCount: 3 })).toBe(true)
    expect(availableSpots({ capacity: 3, participantCount: 2 })).toBe(1)
    expect(availableSpots({ capacity: 3, participantCount: 3 })).toBe(0)
  })

  it('un plan con cupo ilimitado (capacity null) nunca está lleno y no tiene un número de lugares libres', () => {
    expect(isFull({ capacity: null, participantCount: 10_000 })).toBe(false)
    expect(availableSpots({ capacity: null, participantCount: 10_000 })).toBeNull()
  })
})

describe('PRICE_RANGES', () => {
  it('son gratis, $1–500, $501–1000 y más de $1000', () => {
    expect(PRICE_RANGES).toEqual([
      { key: 'free', min: 0, max: 0 },
      { key: 'low', min: 1, max: 500 },
      { key: 'mid', min: 501, max: 1000 },
      { key: 'high', min: 1001, max: null }
    ])
  })

  it('cubren todos los precios sin huecos ni superposiciones', () => {
    expect(PRICE_RANGES[0].min).toBe(0)
    expect(PRICE_RANGES.at(-1).max).toBeNull()
    for (let i = 1; i < PRICE_RANGES.length; i++) {
      expect(PRICE_RANGES[i].min).toBe(PRICE_RANGES[i - 1].max + 1)
    }
  })
})
