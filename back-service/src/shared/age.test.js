import { describe, expect, it } from 'vitest'
import {
  ageOn, calendarDateIn, compareCalendarDates, formatCalendarDate, fromUtcMidnight, parseCalendarDate, toUtcMidnight
} from './age.js'

const day = (year, month, dayOfMonth) => ({ year, month, day: dayOfMonth })

describe('parseCalendarDate', () => {
  it.each(['2000-01-01', '2024-02-29', '1999-12-31'])('acepta %s', (text) => {
    expect(parseCalendarDate(text)).not.toBeNull()
  })

  it.each([
    '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31',
    '2026-1-1', '26-01-01', '2026-01-01T00:00:00Z', ' 2026-01-01', '', 'hoy', '0000-01-01'
  ])('rechaza %j', (text) => {
    expect(parseCalendarDate(text)).toBeNull()
  })

  it.each([null, undefined, 20260101, {}, ['2026-01-01']])('rechaza lo que no es texto (%j)', (value) => {
    expect(parseCalendarDate(value)).toBeNull()
  })
})

describe('ageOn', () => {
  const birth = day(2000, 6, 15)

  it('todavía no cumplió años: el día anterior al cumpleaños', () => {
    expect(ageOn(birth, day(2026, 6, 14))).toBe(25)
  })

  it('cumple años hoy', () => {
    expect(ageOn(birth, day(2026, 6, 15))).toBe(26)
  })

  it('ya cumplió este año', () => {
    expect(ageOn(birth, day(2026, 12, 31))).toBe(26)
  })

  it('antes del cumpleaños pero en un mes posterior del año de nacimiento no resta de más', () => {
    expect(ageOn(day(2000, 12, 31), day(2026, 1, 1))).toBe(25)
  })

  describe('nacidos un 29 de febrero', () => {
    const leapBirth = day(2008, 2, 29)

    it('en un año no bisiesto cumplen el 1 de marzo, no el 28 de febrero', () => {
      expect(ageOn(leapBirth, day(2026, 2, 28))).toBe(17)
      expect(ageOn(leapBirth, day(2026, 3, 1))).toBe(18)
    })

    it('en un año bisiesto cumplen el 29 de febrero', () => {
      expect(ageOn(leapBirth, day(2028, 2, 28))).toBe(19)
      expect(ageOn(leapBirth, day(2028, 2, 29))).toBe(20)
    })
  })
})

describe('calendarDateIn (zona horaria)', () => {
  it('a las 22:00 de Montevideo todavía es el día anterior al de UTC', () => {
    const instant = new Date('2026-10-12T01:00:00Z')

    expect(calendarDateIn(instant, 'America/Montevideo')).toEqual(day(2026, 10, 11))
    expect(calendarDateIn(instant, 'UTC')).toEqual(day(2026, 10, 12))
  })

  it('la edad no sube hasta que empieza el cumpleaños en la zona de la app', () => {
    const birth = day(2000, 10, 12)
    const eveInMontevideo = new Date('2026-10-12T01:00:00Z') // 11/10 22:00 en Montevideo
    const morningInMontevideo = new Date('2026-10-12T12:00:00Z') // 12/10 09:00 en Montevideo

    expect(ageOn(birth, calendarDateIn(eveInMontevideo))).toBe(25)
    expect(ageOn(birth, calendarDateIn(morningInMontevideo))).toBe(26)
  })

  it('por defecto usa la zona de la app', () => {
    expect(calendarDateIn(new Date('2026-01-01T02:00:00Z'))).toEqual(day(2025, 12, 31))
  })
})

describe('conversión a Date', () => {
  it('se guarda a medianoche UTC y vuelve igual, sin importar la zona del proceso', () => {
    const stored = toUtcMidnight(day(2001, 3, 9))

    expect(stored.toISOString()).toBe('2001-03-09T00:00:00.000Z')
    expect(fromUtcMidnight(stored)).toEqual(day(2001, 3, 9))
    expect(formatCalendarDate(stored)).toBe('2001-03-09')
  })
})

describe('compareCalendarDates', () => {
  it('ordena por año, mes y día', () => {
    expect(compareCalendarDates(day(2026, 1, 1), day(2025, 12, 31))).toBeGreaterThan(0)
    expect(compareCalendarDates(day(2026, 5, 1), day(2026, 5, 2))).toBeLessThan(0)
    expect(compareCalendarDates(day(2026, 5, 2), day(2026, 5, 2))).toBe(0)
  })
})
