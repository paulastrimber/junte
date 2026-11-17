import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { ageOn, formatForDisplay, parseCalendarDate, toCalendarDate, toLocalDate, today } from './dates.js'
import { CHAT_ERROR_MESSAGES, fieldErrorsFrom, messageForError, toViewError } from './errorMessages.js'
import { validateBirthDate, validateEmail, validateName, validatePassword, validateResetCode } from './validation.js'

describe('dates', () => {
  it('toCalendarDate usa el día LOCAL, no el de UTC', () => {
    // 23:30 locales del 9 de marzo: en UTC (si la zona está al oeste) ya sería el 10.
    expect(toCalendarDate(new Date(2001, 2, 9, 23, 30))).toBe('2001-03-09')
    expect(toCalendarDate(new Date(2001, 2, 9, 0, 5))).toBe('2001-03-09')
  })

  it('toLocalDate y toCalendarDate son inversas', () => {
    expect(toCalendarDate(toLocalDate('2001-03-09'))).toBe('2001-03-09')
    expect(toCalendarDate(toLocalDate('2024-02-29'))).toBe('2024-02-29')
  })

  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-1', '09/03/2001', '', null])('parseCalendarDate rechaza %j', (value) => {
    expect(parseCalendarDate(value)).toBeNull()
  })

  it('formatForDisplay muestra DD/MM/AAAA', () => {
    expect(formatForDisplay('2001-03-09')).toBe('09/03/2001')
    expect(formatForDisplay('')).toBe('')
  })

  it('ageOn: cumpleaños, el día anterior y el 29 de febrero', () => {
    const birth = { year: 2000, month: 6, day: 15 }
    expect(ageOn(birth, { year: 2026, month: 6, day: 14 })).toBe(25)
    expect(ageOn(birth, { year: 2026, month: 6, day: 15 })).toBe(26)
    const leap = { year: 2008, month: 2, day: 29 }
    expect(ageOn(leap, { year: 2026, month: 2, day: 28 })).toBe(17)
    expect(ageOn(leap, { year: 2026, month: 3, day: 1 })).toBe(18)
  })

  it('today toma el día local del reloj recibido', () => {
    expect(today(new Date(2026, 9, 11, 23, 59))).toEqual({ year: 2026, month: 10, day: 11 })
  })
})

describe('validation', () => {
  const now = new Date(2026, 9, 11, 12)

  it('validateName', () => {
    expect(validateName('Ana')).toBeNull()
    expect(validateName('   ')).toMatch(/nombre/)
    expect(validateName('x'.repeat(81))).toMatch(/80/)
  })

  it('validateEmail', () => {
    expect(validateEmail(' ana@um.edu.uy ')).toBeNull()
    expect(validateEmail('')).toMatch(/email/)
    expect(validateEmail('ana@')).toMatch(/válido/)
    expect(validateEmail('ana um@x.com')).toMatch(/válido/)
  })

  it('validateResetCode acepta 6 dígitos (con espacios alrededor) y nada más', () => {
    expect(validateResetCode('042137')).toBeNull()
    expect(validateResetCode(' 042137 ')).toBeNull()
    expect(validateResetCode('')).toMatch(/código/)
    expect(validateResetCode('12345')).toMatch(/6 dígitos/)
    expect(validateResetCode('1234567')).toMatch(/6 dígitos/)
    expect(validateResetCode('12a456')).toMatch(/6 dígitos/)
  })

  it('validatePassword exige 8 al registrar pero no al iniciar sesión', () => {
    expect(validatePassword('1234567')).toMatch(/8/)
    expect(validatePassword('12345678')).toBeNull()
    expect(validatePassword('1234567', { checkLength: false })).toBeNull()
    expect(validatePassword('')).toMatch(/contraseña/)
    expect(validatePassword('x'.repeat(129))).toMatch(/128/)
  })

  it('validateBirthDate: opcional, existente, no futura y entre 16 y 100 años', () => {
    expect(validateBirthDate('', now)).toBeNull()
    expect(validateBirthDate('2001-03-09', now)).toBeNull()
    expect(validateBirthDate('2026-02-30', now)).toMatch(/válida/)
    expect(validateBirthDate('2026-10-12', now)).toMatch(/futura/)
    expect(validateBirthDate('2010-10-12', now)).toMatch(/16/)
    expect(validateBirthDate('2010-10-11', now)).toBeNull()
    expect(validateBirthDate('1925-10-11', now)).toMatch(/100/)
    expect(validateBirthDate('1926-10-11', now)).toBeNull()
  })
})

describe('errorMessages', () => {
  it('elige el texto por code', () => {
    expect(messageForError(new ApiError({ status: 409, code: 'EMAIL_TAKEN', message: 'x' }))).toMatch(/ya existe/i)
    expect(messageForError(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' }))).toMatch(/incorrectos/)
    expect(messageForError(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))).toMatch(/conexión/)
  })

  it('para un code sin texto propio usa el message del servidor', () => {
    expect(messageForError(new ApiError({ status: 409, code: 'PLAN_FULL', message: 'El plan no tiene cupos' }))).toBe('El plan no tiene cupos')
  })

  it('para un error que no es de la API da un texto genérico y no expone el mensaje', () => {
    expect(messageForError(new TypeError('undefined is not a function'))).not.toMatch(/undefined/)
  })

  it('fieldErrorsFrom agrupa los details de un VALIDATION_ERROR por campo', () => {
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'birthDate', message: 'No puede ser futura' }, { path: 'birthDate', message: 'otro' }, { path: 'city', message: 'Muy largo' }]
    })

    expect(fieldErrorsFrom(error)).toEqual({ birthDate: 'No puede ser futura', city: 'Muy largo' })
    expect(fieldErrorsFrom(new ApiError({ status: 409, code: 'EMAIL_TAKEN' }))).toEqual({})
    expect(fieldErrorsFrom(new Error('x'))).toEqual({})
  })
})

describe('toViewError (contrato entre hooks y screens)', () => {
  it('devuelve exactamente { code, message, requestId }, con el texto elegido por code', () => {
    const error = new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR, requestId: 'r1' })
    expect(toViewError(error)).toEqual({ code: 'NETWORK_ERROR', message: 'No pudimos conectarnos con el servidor. Revisá tu conexión.', requestId: 'r1' })
  })

  it('los textos propios de una acción tienen prioridad', () => {
    const error = new ApiError({ status: 403, code: 'FORBIDDEN' })
    expect(toViewError(error, CHAT_ERROR_MESSAGES)).toEqual({ code: 'FORBIDDEN', message: CHAT_ERROR_MESSAGES.FORBIDDEN, requestId: null })
  })

  it('sin texto propio usa el message del servidor', () => {
    const error = new ApiError({ status: 409, code: 'CAPACITY_BELOW_PARTICIPANTS', message: 'Ya hay 5 inscriptos.', requestId: 'r2' })
    expect(toViewError(error)).toEqual({ code: 'CAPACITY_BELOW_PARTICIPANTS', message: 'Ya hay 5 inscriptos.', requestId: 'r2' })
  })

  it('un error que no es de la API queda como UNKNOWN_ERROR, sin exponer su mensaje', () => {
    const viewError = toViewError(new TypeError('undefined is not a function'))
    expect(viewError).toEqual({ code: CLIENT_ERROR_CODES.UNKNOWN_ERROR, message: expect.any(String), requestId: null })
    expect(viewError.message).not.toMatch(/undefined/)
  })
})
