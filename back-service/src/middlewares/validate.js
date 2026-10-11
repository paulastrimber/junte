// Valida params, query y body con Zod. Un campo desconocido o inválido lanza ZodError, que el
// errorHandler convierte en 400 VALIDATION_ERROR con `details` por campo. Reemplaza el valor de la
// request por el ya parseado (trim, minúsculas, fechas): los controladores solo ven datos válidos.

/**
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate ({ params, query, body }) {
  return function validateRequest (req, res, next) {
    if (params) req.params = params.parse(req.params)
    if (query) {
      // En Express 5 `req.query` es un getter: se redefine en la request para exponer el valor parseado.
      Object.defineProperty(req, 'query', { value: query.parse(req.query), configurable: true, enumerable: true, writable: true })
    }
    // Sin body (o sin Content-Type JSON) Express deja req.body undefined: se valida como si fuera {}.
    if (body) req.body = body.parse(req.body ?? {})
    next()
  }
}
