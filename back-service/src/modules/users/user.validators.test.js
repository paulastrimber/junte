import { describe, expect, it } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createUserValidators } from './user.validators.js'

// 11/10/2026 12:00 en Montevideo.
const clock = createFixedClock('2026-10-11T15:00:00Z')
const { updateProfileBody, setPhotoBody } = createUserValidators({ clock })

const parse = (body) => updateProfileBody.safeParse(body)
const messages = (result) => result.error.issues.map((issue) => issue.message).join(' | ')

describe('PUT /users/me', () => {
  it('acepta los campos editables', () => {
    const result = parse({
      name: '  Ana  ', birthDate: '2001-03-09', university: 'um', career: 'ingenieria-en-informatica', city: 'montevideo', neighborhood: 'pocitos', interests: ['futbol', 'cine']
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      name: 'Ana',
      birthDate: new Date('2001-03-09T00:00:00.000Z'),
      university: 'um',
      career: 'ingenieria-en-informatica',
      city: 'montevideo',
      neighborhood: 'pocitos',
      interests: ['futbol', 'cine']
    })
  })

  it('acepta una actualización parcial', () => {
    expect(parse({ city: 'montevideo' }).success).toBe(true)
  })

  it('rechaza un body vacío', () => {
    expect(parse({}).success).toBe(false)
  })

  it.each([
    ['age', 25],
    ['email', 'otro@um.edu.uy'],
    ['role', 'admin'],
    ['status', 'suspended'],
    ['reputation', 99],
    ['passwordHash', 'x'],
    ['photoKey', 'users/x/y.jpg'],
    ['id', '665f1c2a9b1e8a0012345678'],
    ['userId', '665f1c2a9b1e8a0012345678'],
    ['refreshTokenHash', 'x']
  ])('rechaza el campo no editable %s (.strict)', (field, value) => {
    const result = parse({ name: 'Ana', [field]: value })

    expect(result.success).toBe(false)
  })

  describe('birthDate', () => {
    it.each(['2026-02-30', '2001-13-01', '2001-3-9', '09/03/2001', '2001-03-09T00:00:00Z', 'ayer', ''])('rechaza %j', (birthDate) => {
      expect(parse({ birthDate }).success).toBe(false)
    })

    it.each([20010309, null, {}, ['2001-03-09']])('rechaza lo que no es texto (%j)', (birthDate) => {
      expect(parse({ birthDate }).success).toBe(false)
    })

    it('rechaza una fecha futura', () => {
      expect(messages(parse({ birthDate: '2026-10-12' }))).toMatch(/futura/)
    })

    it('hoy en la zona de la app todavía no es "mañana" aunque en UTC ya lo sea', () => {
      const lateEvening = createFixedClock('2026-10-12T01:00:00Z') // 11/10 22:00 en Montevideo
      const validators = createUserValidators({ clock: lateEvening })

      expect(validators.updateProfileBody.safeParse({ birthDate: '2026-10-12' }).success).toBe(false)
      expect(validators.updateProfileBody.safeParse({ birthDate: '2010-10-11' }).success).toBe(true)
    })

    it('menos de 16 años cumplidos → rechazada (el día antes del cumpleaños 16)', () => {
      expect(parse({ birthDate: '2010-10-12' }).success).toBe(false)
    })

    it('16 años cumplidos hoy → aceptada', () => {
      expect(parse({ birthDate: '2010-10-11' }).success).toBe(true)
    })

    it('100 años cumplidos hoy → aceptada; 101 → rechazada', () => {
      expect(parse({ birthDate: '1926-10-11' }).success).toBe(true)
      expect(parse({ birthDate: '1925-10-11' }).success).toBe(false)
      expect(parse({ birthDate: '1925-10-12' }).success).toBe(true) // todavía tiene 100
    })

    it('nacido un 29 de febrero: cumple 16 el 1 de marzo en un año no bisiesto', () => {
      const before = createUserValidators({ clock: createFixedClock('2024-02-28T15:00:00Z') })
      const after = createUserValidators({ clock: createFixedClock('2024-03-01T15:00:00Z') })
      // 2008-02-29 → 16 años el 29/02/2024 (2024 es bisiesto): el 28/02 todavía no, el 01/03 sí.
      expect(before.updateProfileBody.safeParse({ birthDate: '2008-02-29' }).success).toBe(false)
      expect(after.updateProfileBody.safeParse({ birthDate: '2008-02-29' }).success).toBe(true)
    })
  })

  describe('referencias a catálogos (universidad, carrera, ciudad, barrio)', () => {
    it.each(['university', 'career', 'city', 'neighborhood'])('%s: acepta una key, incluida la opción "Otra" (other)', (field) => {
      expect(parse({ [field]: 'otra-opcion-valida' }).success).toBe(true)
      expect(parse({ [field]: 'other' }).success).toBe(true)
    })

    it.each(['university', 'career', 'city', 'neighborhood'])('%s: rechaza texto libre, mayúsculas, vacío y keys enormes', (field) => {
      expect(parse({ [field]: 'Universidad de Montevideo' }).success).toBe(false)
      expect(parse({ [field]: 'UM' }).success).toBe(false)
      expect(parse({ [field]: 'Pocitos' }).success).toBe(false)
      expect(parse({ [field]: '' }).success).toBe(false)
      expect(parse({ [field]: 'a'.repeat(81) }).success).toBe(false)
      expect(parse({ [field]: '../etc' }).success).toBe(false)
    })

    it('name no puede ser vacío ni larguísimo', () => {
      expect(parse({ name: '  ' }).success).toBe(false)
      expect(parse({ name: 'x'.repeat(81) }).success).toBe(false)
    })
  })

  describe('interests', () => {
    it('acepta hasta 10 keys y el arreglo vacío', () => {
      expect(parse({ interests: ['futbol', 'rugby', 'tenis', 'padel', 'cine', 'anime', 'teatro', 'playa', 'asado', 'yoga'] }).success).toBe(true)
      expect(parse({ interests: [] }).success).toBe(true)
    })

    it('rechaza más de 10', () => {
      const eleven = Array.from({ length: 11 }, (_, i) => `interes-${i}`)

      expect(parse({ interests: eleven }).success).toBe(false)
    })

    it('rechaza repetidos y valores que no son una key', () => {
      expect(parse({ interests: ['futbol', 'futbol'] }).success).toBe(false)
      expect(parse({ interests: ['Fútbol'] }).success).toBe(false)
      expect(parse({ interests: [{ $gt: '' }] }).success).toBe(false)
    })
  })

  describe('onboardingCompleted', () => {
    it('solo acepta true (no se puede volver atrás) y cuenta como un campo', () => {
      expect(parse({ onboardingCompleted: true }).success).toBe(true)
      expect(parse({ onboardingCompleted: false }).success).toBe(false)
      expect(parse({ onboardingCompleted: 'true' }).success).toBe(false)
    })

    it('no se puede forzar la fecha interna', () => {
      expect(parse({ onboardingCompletedAt: '2026-01-01T00:00:00Z' }).success).toBe(false)
    })
  })

  it('rechaza operadores de Mongo en cualquier campo', () => {
    expect(parse({ name: { $ne: null } }).success).toBe(false)
    expect(parse({ interests: [{ $gt: '' }] }).success).toBe(false)
  })

  it('los mensajes salen en español', () => {
    expect(messages(parse({ name: 5 }))).toMatch(/texto/)
  })
})

describe('PUT /users/me/photo', () => {
  it('acepta una objectKey con forma de foto de usuario', () => {
    expect(setPhotoBody.safeParse({ objectKey: 'users/665f1c2a9b1e8a0012345678/0b7d-4c.jpg' }).success).toBe(true)
  })

  it.each([
    {},
    { objectKey: '' },
    { objectKey: 'users/../../etc/passwd' },
    { objectKey: 'plans/665f1c2a9b1e8a0012345678/a.jpg' },
    { objectKey: 'users/665f1c2a9b1e8a0012345678/a.exe' },
    { objectKey: 'users/665f1c2a9b1e8a0012345678/a.jpg', extra: 1 },
    { objectKey: { $ne: null } }
  ])('rechaza %j', (body) => {
    expect(setPhotoBody.safeParse(body).success).toBe(false)
  })
})
