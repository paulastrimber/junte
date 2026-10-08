// Correlación de logs: el mismo requestId aparece en Nginx, en los logs de Express y en el error.
import { randomUUID } from 'node:crypto'

export const REQUEST_ID_HEADER = 'X-Request-Id'

// Solo se acepta un id "seguro" de Nginx/cliente: evita inyectar saltos de línea o basura en los logs.
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

/**
 * Toma `X-Request-Id` (lo pone Nginx) o genera uno, lo deja en `req.id` y lo devuelve en la respuesta.
 * @param {{ generateId?: () => string }} [options]
 */
export function createRequestId ({ generateId = randomUUID } = {}) {
  return function requestId (req, res, next) {
    const incoming = req.get(REQUEST_ID_HEADER)
    req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : generateId()
    res.set(REQUEST_ID_HEADER, req.id)
    next()
  }
}
