// Una línea de log por request (al terminar): requestId, método, ruta, status y duración.
// Sin bodies, headers, query string (puede traer coordenadas del feed) ni tokens.
import { pinoHttp } from 'pino-http'

const MAX_LOGGED_PATH_LENGTH = 200
const ROUTE_PATTERN = Symbol('routePattern')

// Guarda el patrón completo (`/internal/plans/:id`) en el momento en que el router matchea la ruta.
// Hace falta porque Express restaura `req.baseUrl` cuando un error sale de un sub-router, y al
// terminar la request ya no se puede reconstruir el patrón con `req.baseUrl + req.route.path`.
function trackRoutePattern (req) {
  let current = req.route
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (route) => {
      current = route
      if (typeof route?.path === 'string') req[ROUTE_PATTERN] = `${req.baseUrl}${route.path}`
    }
  })
}

// Patrón de la ruta, no la URL con IDs. Si no matcheó ninguna ruta (p. ej. un 404),
// se loguea el path sin query string (el feed manda coordenadas por query) y truncado.
function routeOf (req) {
  if (req[ROUTE_PATTERN]) return { route: req[ROUTE_PATTERN] }
  const [path] = (req.originalUrl ?? req.url ?? '').split('?')
  return { route: null, path: path.slice(0, MAX_LOGGED_PATH_LENGTH) }
}

function summary (req, res, responseTime) {
  return {
    method: req.method,
    ...routeOf(req),
    status: res.statusCode,
    durationMs: responseTime,
    ...(req.user?.id ? { userId: req.user.id } : {})
  }
}

/**
 * @param {{ logger: import('pino').Logger }} deps
 *   Requiere que `requestId` haya corrido antes (usa `req.id`).
 */
export function createHttpLogger ({ logger }) {
  const logRequest = pinoHttp({
    logger,
    genReqId: (req) => req.id,
    // req.log / res.log quedan como hijos con solo { requestId }: nunca se serializa el req completo.
    quietReqLogger: true,
    quietResLogger: true,
    customAttributeKeys: { reqId: 'requestId' },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    customSuccessObject: (req, res, { responseTime }) => summary(req, res, responseTime),
    // `res.err` lo setea el errorHandler solo para errores no previstos: el stack va al log, nunca a la respuesta.
    customErrorObject: (req, res, _err, { responseTime }) => ({
      ...summary(req, res, responseTime),
      ...(res.err ? { err: res.err } : {})
    })
  })

  return function httpLogger (req, res, next) {
    trackRoutePattern(req)
    logRequest(req, res, next)
  }
}
