// Paginación por cursor (docs/arquitectura/06-api.md#paginación): `limit` (20 por defecto, máx. 100) y un `cursor`
// opaco. El cursor es base64url de un JSON con la última clave de orden: el cliente nunca lo arma ni lo interpreta,
// y uno manipulado o de otra consulta es un 400, nunca un error interno ni un filtro que llegue a MongoDB.
import { errors } from './errors.js'
import { z } from './validation.js'

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100
const MAX_CURSOR_LENGTH = 512

export const limitField = z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)

// Mayor instante que admite un Date de JavaScript: un número más grande daría una fecha inválida y la query fallaría
// con un 500 en lugar del 400 de un cursor manipulado.
const MAX_DATE_MS = 8.64e15

/** Instante (ms) dentro de un cursor: lo usan todos los listados que ordenan por una fecha. */
export const cursorInstantField = z.number().int().nonnegative().max(MAX_DATE_MS)

/** Forma del cursor en la request (se decodifica después, con el esquema de cada listado). */
export const cursorField = z.string().regex(/^[A-Za-z0-9_-]+$/, { error: 'El cursor no es válido' }).max(MAX_CURSOR_LENGTH)

/**
 * @param {object} payload  Datos planos (números, strings).
 * @returns {string}
 */
export function encodeCursor (payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

const invalidCursor = () => errors.validation([{ path: 'cursor', message: 'El cursor no es válido' }])

/**
 * @template T
 * @param {string} cursor
 * @param {import('zod').ZodType<T>} schema  Forma esperada del contenido.
 * @returns {T}
 * @throws {import('./errors.js').AppError} VALIDATION_ERROR si no se puede decodificar o no tiene la forma esperada.
 */
export function decodeCursor (cursor, schema) {
  let payload
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw invalidCursor()
  }
  const result = schema.safeParse(payload)
  if (!result.success) throw invalidCursor()
  return result.data
}
