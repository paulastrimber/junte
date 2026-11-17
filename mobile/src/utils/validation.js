// Validación local de formularios: ahorra un viaje al servidor y da el error junto al campo.
// El back valida todo otra vez (Zod): esto nunca reemplaza esa validación. Cada función devuelve el
// mensaje de error o null si el valor es válido.
import { MAX_AGE, MIN_AGE, ageOn, parseCalendarDate, today } from './dates.js'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const NAME_MAX = 80
/** Dígitos del código de recuperación de contraseña que llega por email. */
export const RESET_CODE_LENGTH = 6

// Forma básica (algo@dominio.tld); la validación real del formato la hace el back.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_CODE = /^\d{6}$/

export function validateName (value) {
  const text = value.trim()
  if (text === '') return 'Ingresá tu nombre.'
  if (text.length > NAME_MAX) return `El nombre admite hasta ${NAME_MAX} caracteres.`
  return null
}

export function validateEmail (value) {
  const text = value.trim()
  if (text === '') return 'Ingresá tu email.'
  if (text.length > 254 || !EMAIL.test(text)) return 'Ingresá un email válido.'
  return null
}

/** @param {string} value @param {{ checkLength?: boolean }} [options] El login no explica la política de contraseñas. */
export function validatePassword (value, { checkLength = true } = {}) {
  if (value === '') return 'Ingresá tu contraseña.'
  if (checkLength && value.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`
  if (value.length > PASSWORD_MAX) return `La contraseña admite hasta ${PASSWORD_MAX} caracteres.`
  return null
}

/** Código de recuperación de contraseña: 6 dígitos (se aceptan espacios alrededor, por el copiar y pegar). */
export function validateResetCode (value) {
  const text = value.trim()
  if (text === '') return 'Ingresá el código que te llegó por email.'
  if (!RESET_CODE.test(text)) return `El código tiene ${RESET_CODE_LENGTH} dígitos.`
  return null
}

/**
 * @param {string} value `YYYY-MM-DD` o ''
 * @param {Date} [now]
 */
export function validateBirthDate (value, now = new Date()) {
  if (value === '') return null // opcional hasta completar el perfil
  const birth = parseCalendarDate(value)
  if (!birth) return 'La fecha de nacimiento no es válida.'
  const age = ageOn(birth, today(now))
  if (age < 0) return 'La fecha de nacimiento no puede ser futura.'
  if (age < MIN_AGE || age > MAX_AGE) return `La edad tiene que estar entre ${MIN_AGE} y ${MAX_AGE} años.`
  return null
}
