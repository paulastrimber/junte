import { describe, expect, it } from 'vitest'
import { ATTENDANCE, computeCheckInWindow, isAccurateEnough, isWithinRadius, isWithinWindow } from './attendance.js'
import { haversineMeters } from './geo.js'

const at = (iso) => new Date(iso)

describe('computeCheckInWindow', () => {
  it('abre 15 minutos antes y cierra 60 minutos después del comienzo', () => {
    const window = computeCheckInWindow({ startsAt: at('2028-03-03T18:00:00Z'), endsAt: at('2028-03-03T21:00:00Z') })

    expect(window.checkInOpensAt).toEqual(at('2028-03-03T17:45:00Z'))
    expect(window.checkInClosesAt).toEqual(at('2028-03-03T19:00:00Z'))
  })

  it('nunca cierra después de endsAt: un plan de 30 minutos cierra cuando termina', () => {
    const window = computeCheckInWindow({ startsAt: at('2028-03-03T18:00:00Z'), endsAt: at('2028-03-03T18:30:00Z') })

    expect(window.checkInClosesAt).toEqual(at('2028-03-03T18:30:00Z'))
  })
})

describe('isWithinWindow', () => {
  const opensAt = at('2028-03-03T17:45:00Z')
  const closesAt = at('2028-03-03T19:00:00Z')

  it('rechaza un segundo antes de abrir', () => {
    expect(isWithinWindow({ opensAt, closesAt, now: at('2028-03-03T17:44:59Z') })).toBe(false)
  })

  it('acepta exactamente al abrir y exactamente al cerrar', () => {
    expect(isWithinWindow({ opensAt, closesAt, now: opensAt })).toBe(true)
    expect(isWithinWindow({ opensAt, closesAt, now: closesAt })).toBe(true)
  })

  it('rechaza un segundo después de cerrar', () => {
    expect(isWithinWindow({ opensAt, closesAt, now: at('2028-03-03T19:00:01Z') })).toBe(false)
  })
})

describe('isWithinRadius e isAccurateEnough', () => {
  it('exactamente en el radio se acepta; un metro más lejos, no', () => {
    expect(isWithinRadius(150, 150)).toBe(true)
    expect(isWithinRadius(151, 150)).toBe(false)
  })

  it('la precisión se acepta hasta el máximo inclusive', () => {
    expect(isAccurateEnough(ATTENDANCE.MAX_ACCURACY_METERS)).toBe(true)
    expect(isAccurateEnough(ATTENDANCE.MAX_ACCURACY_METERS + 0.1)).toBe(false)
  })
})

describe('haversineMeters', () => {
  const MONTEVIDEO = [-56.1645, -34.9011]

  it('da 0 entre un punto y sí mismo', () => {
    expect(haversineMeters(MONTEVIDEO, MONTEVIDEO)).toBe(0)
  })

  it('un grado de latitud son unos 111,2 km', () => {
    const distance = haversineMeters(MONTEVIDEO, [MONTEVIDEO[0], MONTEVIDEO[1] + 1])

    expect(distance).toBeGreaterThan(111_100)
    expect(distance).toBeLessThan(111_300)
  })

  it('es simétrica y recibe las coordenadas como [lng, lat]', () => {
    const puntaCarretas = [-56.1596, -34.9236]

    const distance = haversineMeters(MONTEVIDEO, puntaCarretas)

    expect(distance).toBeCloseTo(haversineMeters(puntaCarretas, MONTEVIDEO), 6)
    expect(distance).toBeGreaterThan(2400)
    expect(distance).toBeLessThan(2700)
  })
})
