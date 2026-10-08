# Errores y logs

## Formato de error

Toda respuesta de error, venga de donde venga (Express o Nginx), tiene esta forma:

```json
{ "code": "PLAN_FULL", "message": "El plan no tiene cupos disponibles", "requestId": "9f1c…" }
```

- `code`: estable, en inglés, UPPER_SNAKE. **La app decide qué hacer según `code`, nunca según `message`.**
- `message`: texto en español apto para mostrar al usuario.
- `requestId`: el mismo que aparece en los logs de Nginx y Express.
- `details` (solo en `VALIDATION_ERROR`): `[{ path: 'capacity', message: 'Debe ser mayor que 0' }]`.
- **Nunca**: stack traces, mensajes de MongoDB, nombres de colecciones, queries.

## Catálogo de códigos

| `code` | HTTP | Cuándo |
|--------|------|--------|
| `VALIDATION_ERROR` | 400 | Zod rechazó params, query o body |
| `UNAUTHENTICATED` | 401 | Sin token, token inválido, firma o algoritmo incorrectos, refresh revocado |
| `TOKEN_EXPIRED` | 401 | Access token vencido (la app intenta refresh) |
| `INVALID_CREDENTIALS` | 401 | Login fallido (mismo mensaje para email inexistente y contraseña mala) |
| `ACCOUNT_SUSPENDED` | 401 | Usuario con `status: 'suspended'` |
| `FORBIDDEN` | 403 | Autenticado sin permiso (plan ajeno, no participante, no admin) |
| `QR_INVALID` | 403 | QR inexistente, vencido o de otro plan |
| `OUT_OF_RANGE` | 403 | Distancia mayor al radio o precisión insuficiente |
| `NOT_FOUND` | 404 | Recurso inexistente o no visible |
| `EMAIL_TAKEN` | 409 | Registro con email existente |
| `PROFILE_INCOMPLETE` | 409 | Crear plan sin perfil completo |
| `PLAN_FULL` | 409 | Sin cupos |
| `PLAN_CLOSED` | 409 | El plan no admite inscripciones/bajas en su estado actual |
| `ALREADY_JOINED` | 409 | Inscripción activa duplicada |
| `CAPACITY_BELOW_PARTICIPANTS` | 409 | `PATCH capacity` menor a los inscriptos |
| `CHECKIN_WINDOW_CLOSED` | 409 | Fuera de `checkInOpensAt`–`checkInClosesAt` (también al generar QR) |
| `ALREADY_CHECKED_IN` | 409 | Segundo check-in |
| `RATE_LIMITED` | 429 | Lo genera Nginx |
| `INTERNAL` | 500 | Cualquier error no previsto |

Agregar un código = agregarlo acá, en `shared/errors.js` y en el manejo de la app, en el mismo PR.

## Implementación en el back

```js
// shared/errors.js
export class AppError extends Error {
  constructor (code, message, { status, details } = {}) {
    super(message)
    this.code = code
    this.status = status ?? STATUS_BY_CODE[code]
    this.details = details
  }
}
export const errors = {
  planFull: () => new AppError('PLAN_FULL', 'El plan no tiene cupos disponibles'),
  forbidden: (msg = 'No tenés permiso para esta acción') => new AppError('FORBIDDEN', msg)
  // …
}

// middlewares/errorHandler.js
export function errorHandler (err, req, res, _next) {
  const isKnown = err instanceof AppError
  const status = isKnown ? err.status : 500
  if (!isKnown) req.log.error({ err }, 'unhandled error')   // stack solo en el log, nunca en la respuesta
  res.status(status).json({
    code: isKnown ? err.code : 'INTERNAL',
    message: isKnown ? err.message : 'Ocurrió un error inesperado',
    requestId: req.id,
    ...(isKnown && err.details ? { details: err.details } : {})
  })
}
```

- Errores esperados → `AppError` desde el servicio o repositorio.
- Errores de MongoDB conocidos se traducen **en el repositorio** (E11000 en `planParticipants` → `ALREADY_JOINED`; en `users.email` → `EMAIL_TAKEN`). Un servicio nunca ve un código de Mongo.
- Todo lo demás llega al `errorHandler` como 500.

## Logs

Logger estructurado en JSON (**pino**), una línea por evento, salida a stdout → agente de CloudWatch.

### Qué se loguea

| Evento | Campos |
|--------|--------|
| Cada request (al terminar) | `requestId`, `method`, `route` (patrón, no URL con IDs), `status`, `durationMs`, `userId?` |
| Error 500 | Lo anterior + `err` con stack |
| Eventos de negocio relevantes | `event: 'plan.joined'`, `planId`, `userId` |
| Socket.io | `connect`/`disconnect`, `userId`, motivo |
| Jobs | inicio, fin, cantidad procesada, si obtuvo el lock |
| FCM | fallos de envío y tokens eliminados (sin el token completo) |

### Qué NO se loguea nunca

Contraseñas, `Authorization`, access/refresh tokens, `qrToken`, coordenadas exactas, bodies completos, URLs firmadas de S3, secretos de configuración.
pino con `redact: ['req.headers.authorization', '*.password', '*.refreshToken', '*.qrToken', '*.latitude', '*.longitude']` como red de seguridad, además de no pasarlos.

### Niveles

`error` (requiere atención), `warn` (algo raro pero manejado: FCM caído, retry de transacción), `info` (requests y eventos de negocio), `debug` (solo local). En AWS el nivel es `info`.

### Retención

Retención limitada en CloudWatch (propuesta: 14–30 días). Los logs no son un archivo histórico.

## En la app

- `ApiError` con `status`, `code`, `message`, `requestId`.
- Mapeo por `code`: `TOKEN_EXPIRED` → refresh; `PLAN_FULL` → refrescar detalle y mostrar mensaje; `RATE_LIMITED` → reintentar con espera; `INTERNAL` → mensaje genérico + `requestId` visible en desarrollo.
- Nada de `console.log` con tokens o respuestas completas; en producción, los logs de la app se desactivan.
