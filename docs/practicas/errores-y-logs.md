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
| `UNAUTHENTICATED` | 401 | Sin token, token inválido, firma o algoritmo incorrectos; refresh vencido, revocado o reutilizado; usuario inexistente |
| `TOKEN_EXPIRED` | 401 | Access token vencido (la app intenta refresh). Un refresh vencido NO usa este código |
| `INVALID_CREDENTIALS` | 401 | Login fallido (mismo mensaje para email inexistente, contraseña mala y hash guardado con formato inválido) |
| `ACCOUNT_SUSPENDED` | 401 | Usuario con `status: 'suspended'` (en login, refresh o con cualquier token). Pierde todas sus sesiones |
| `FORBIDDEN` | 403 | Autenticado sin permiso (plan ajeno, no participante —check-in y lista de anotados—, no admin) |
| `QR_INVALID` | 403 | QR ausente, mal formado, vencido o de otro plan; también el QR anterior una vez pasados sus 10 segundos de margen |
| `OUT_OF_RANGE` | 403 | Distancia mayor al radio del plan, o precisión del GPS peor que 100 m (el `message` dice cuál de las dos) |
| `NOT_FOUND` | 404 | Recurso inexistente o no visible |
| `EMAIL_TAKEN` | 409 | Registro con email existente (también con otras mayúsculas o espacios) |
| `PROFILE_INCOMPLETE` | 409 | Crear plan sin perfil completo |
| `PLAN_FULL` | 409 | Sin cupos |
| `PLAN_NOT_FULL` | 409 | Pedir aviso de lugar libre (`PUT /plans/:id/spot-alert`) en un plan con lugar o de cupo ilimitado (S5) |
| `PLAN_CLOSED` | 409 | El plan no admite esa operación en su estado actual: inscripción (cerrado o ya empezado), baja (empezado, cancelado, completado o con el check-in hecho), edición, QR o check-in de un plan cancelado o completado, o un cambio de `status` que no corresponde |
| `ALREADY_JOINED` | 409 | Inscripción activa duplicada |
| `CAPACITY_BELOW_PARTICIPANTS` | 409 | `PATCH capacity` menor a los inscriptos (pasar a `null`, cupo ilimitado, nunca lo dispara) |
| `CHECKIN_WINDOW_CLOSED` | 409 | Fuera de `checkInOpensAt`–`checkInClosesAt` (también al generar QR) |
| `ALREADY_CHECKED_IN` | 409 | Segundo check-in |
| `CATALOG_KEY_TAKEN` | 409 | Panel de administración: ya existe una opción del catálogo con esa `key` (S6). La app no lo recibe nunca |
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
| Eventos de negocio relevantes | `event` (`plan.joined`, `plan.left`, `plan.checked_in`, `plan.status_changed`, `plan.attendance_closed`, `plan.completed`, `spot_alert.requested`, `spot_alert.cancelled`, `device.registered`, `device.unregistered`, `message.sent` con `type`), `planId`, `userId` |
| Socket.io | `connect`/`disconnect`, `userId`, motivo |
| Jobs | `job`, inicio y fin, `processed`, `durationMs`, `lockAcquired`; `warn` si no hay Redis (el ciclo se saltea) |
| FCM | fallos de envío y tokens eliminados (sin el token completo) |

### Qué NO se loguea nunca

Contraseñas, `Authorization`, access/refresh tokens, `qrToken`, coordenadas exactas, bodies completos, URLs firmadas de S3, secretos de configuración, y los datos personales del perfil (`birthDate`, `neighborhood`, `city`).
pino con `redact` sobre `req.headers.authorization`, `password`, `passwordHash`, `refreshTokenHash`, `accessToken`, `refreshToken`, `token`, `qrToken`, `latitude`, `longitude`, `birthDate`, `neighborhood`, `city`, `photoUrl` (en la raíz y un nivel anidado; lista completa en `adapters/logger.js`) como red de seguridad, además de no pasarlos.

### Niveles

`error` (requiere atención), `warn` (algo raro pero manejado: FCM caído, retry de transacción), `info` (requests y eventos de negocio), `debug` (solo local). En AWS el nivel es `info`.

### Retención

Retención limitada en CloudWatch (propuesta: 14–30 días). Los logs no son un archivo histórico.

## En la app

- `ApiError` con `status`, `code`, `message`, `requestId`.
- Códigos que genera **solo la app** (el back nunca los devuelve): `NETWORK_ERROR` (status 0, sin respuesta), `TIMEOUT` (status 0, timeout del cliente, 10 s), `REQUEST_CANCELED` (status 0, `AbortController`), `UNKNOWN_ERROR` (status sin código genérico y sin `code` en el cuerpo, o error de programación), `LOCATION_DENIED` y `LOCATION_UNAVAILABLE` (el check-in no pudo obtener la ubicación: no se llama al servidor), `UPLOAD_FAILED` (S3 rechazó la subida de la foto, con el status de S3), `IMAGE_NOT_SUPPORTED` (la imagen elegida no es JPEG/PNG/WebP o está vacía) e `IMAGE_TOO_LARGE` (más de 5 MB). Si la respuesta no trae `code` se usa uno del catálogo por status: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 429 `RATE_LIMITED`, ≥ 500 `INTERNAL`.
- Mapeo por `code`: `TOKEN_EXPIRED` y `UNAUTHENTICATED` en una request con token → **un solo** refresh en vuelo y un reintento (si el refresh es rechazado con 401, se vuelve al login); `ACCOUNT_SUSPENDED` → vuelve al login sin refresh; `EMAIL_TAKEN` / `INVALID_CREDENTIALS` → mensaje junto al formulario; `PLAN_FULL`, `PLAN_CLOSED` y `ALREADY_JOINED` al inscribirse o darse de baja → refrescar el detalle y mostrar un texto propio de esa acción; en el check-in, un texto por código (`QR_INVALID`, `OUT_OF_RANGE`, `CHECKIN_WINDOW_CLOSED`, `ALREADY_CHECKED_IN`); `RATE_LIMITED` → reintentar con espera; `INTERNAL` → mensaje genérico + `requestId` visible en desarrollo.
- **Sin conexión (S6):** `NETWORK_ERROR` y `TIMEOUT` son "sin conexión". Una lectura muestra lo último guardado en el teléfono (con la hora); inscribirse, darse de baja, un mensaje del chat y un reporte quedan en la cola de pendientes y se mandan solos al volver la red. Lo que el servidor rechace al sincronizar (p. ej. `PLAN_FULL`) queda visible con su motivo hasta que la persona lo descarte. `ALREADY_JOINED` al reintentar una inscripción encolada cuenta como hecha.
- **Pantallas (S6-MOB-05):** una carga que falla muestra siempre el mismo `ErrorState` (ícono, qué no se pudo cargar, el motivo por `code`, `requestId` en desarrollo y "Reintentar"; sin conexión dice "Sin conexión"). Un error de una acción puntual va en un `ErrorBanner` junto a la acción.
- Nada de `console.log` con tokens o respuestas completas; en producción, los logs de la app se desactivan.
