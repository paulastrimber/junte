# 06 · API

Contrato público publicado por Nginx bajo `/api/v1`. El back lo atiende bajo `/internal` (misma ruta relativa). Las rutas de esta tabla son relativas a `/api/v1`.

> Leyenda de estado: **✔ informe** = definido en el informe · **➕ revisión** = agregado por la revisión del informe · **❓ propuesto** = necesario pero no definido; validar con el equipo antes de implementar ([pendientes](../pendientes.md)).

## Convenciones

- Todas las rutas requieren `Authorization: Bearer <access_token>` salvo `POST /auth/register`, `/auth/login`, `/auth/refresh` y `GET /health`. Las URLs son sensibles a mayúsculas y a la barra final: `/auth/Login` y `/auth/login/` no existen (404).
- Cuerpos `application/json`; fechas ISO 8601 con zona horaria; IDs como strings; campos en inglés; coordenadas `[lng, lat]`.
- **Campos solo-backend** (se ignoran o se rechazan con 400 si vienen en un body): `id`, `creatorId`, `senderId`, `userId`, `reporterId`, `reputation`, `role`, `status` de usuario, `age` (se calcula desde `birthDate`), `photoKey`, `noShow`, `noShowAt`, `participantCount`, `university` del plan, `qrNonceHash`.
- Los esquemas Zod son **estrictos** (`.strict()`): un campo desconocido es 400, no se descarta en silencio.

### Paginación

`?limit=` (default 20, máx 100) y `?cursor=`. Respuesta: `{ "items": [...], "nextCursor": "..." | null }`.
El cursor es **opaco** (base64url de la última clave de orden, p. ej. `{ createdAt, _id }`): el cliente nunca lo arma ni lo interpreta.

### Errores

`{ "code": "PLAN_FULL", "message": "El plan no tiene cupos disponibles", "requestId": "…" }`

| HTTP | Cuándo | Ejemplos de `code` |
|------|--------|--------------------|
| 400 | Validación de formato o dominio | `VALIDATION_ERROR` (+ `details` con campos) |
| 401 | Token ausente, inválido, vencido o revocado; login fallido; cuenta suspendida. `TOKEN_EXPIRED` solo para un access vencido (la app intenta el refresh); un refresh vencido, revocado o reutilizado es `UNAUTHENTICATED` | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED` |
| 403 | Autenticado pero sin permiso | `FORBIDDEN`, `QR_INVALID`, `OUT_OF_RANGE` |
| 404 | No existe o no es visible para el usuario | `NOT_FOUND` |
| 409 | Conflicto de estado | `EMAIL_TAKEN`, `PLAN_FULL`, `ALREADY_JOINED`, `PLAN_CLOSED`, `PROFILE_INCOMPLETE`, `CAPACITY_BELOW_PARTICIPANTS`, `CHECKIN_WINDOW_CLOSED`, `ALREADY_CHECKED_IN` |
| 429 | Rate limit (lo genera Nginx) | `RATE_LIMITED` |
| 500 | Falla interna, sin detalles | `INTERNAL` |

Catálogo completo y reglas en [errores-y-logs.md](../practicas/errores-y-logs.md).

## Endpoints

### Auth

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `POST /auth/register` | `name, email, password` + opcionales `university, interests, deviceLabel` | 201 `{ user, accessToken, refreshToken }` | 400, 409 `EMAIL_TAKEN` | Pública | ✔ |
| `POST /auth/login` | `email, password` + opcional `deviceLabel` | 200 `{ user, accessToken, refreshToken }` | 400, 401 `INVALID_CREDENTIALS` / `ACCOUNT_SUSPENDED` | Pública | ✔ |
| `POST /auth/refresh` | `refreshToken` | 200 `{ accessToken, refreshToken }` rotados | 400, 401 `UNAUTHENTICATED` / `ACCOUNT_SUSPENDED` | Pública | ✔ |
| `POST /auth/logout` | — | 204: cierra la sesión del access token (idempotente) | 401 | Usuario | ➕ |
| `POST /auth/logout-all` | — | 204: cierra todas las sesiones del usuario | 401 | Usuario | ➕ |

- `login` devuelve también `user` (el informe solo listaba los tokens): la app evita un `GET /users/me` extra.
- `password`: 8 a 128 caracteres. `name`: 1 a 80. `email`: válido, hasta 254, se normaliza (trim + minúsculas). `interests`: ver [Perfil](#perfil-de-usuario). `deviceLabel`: 1 a 60 caracteres, solo para identificar la sesión ("android", "ios").
- Un usuario puede tener sesión en varios dispositivos a la vez (máximo 5 activas; al abrir la sexta se cierra la más antigua). Ver [ADR-0008](adr/0008-sesiones-multiples.md).
- Reglas del refresh: cada uso rota el par. Reutilizar un refresh ya rotado cierra **esa** sesión y responde 401 (no afecta a las de otros dispositivos). Dos refresh simultáneos con el mismo token: uno gana y el otro se trata como reuso, por eso la app hace un solo refresh en vuelo.
- `logout` y `logout-all` se autentican con el access token (el `sid` va en el token). Tras el logout el access token sigue valiendo hasta que vence (≤ 15 min); el refresh deja de servir en el acto.
- Rate limit de Nginx: zona estricta (10 req/min por IP) solo en `login` y `register`; el resto usa la zona general.

### Usuario y dispositivos

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /users/me` | — | 200 perfil propio | 401 | Usuario | ✔ |
| `PUT /users/me` | cualquiera de `name, birthDate, university, neighborhood, city, interests` (cambio parcial, al menos uno) | 200 perfil actualizado | 400 | Usuario sobre su perfil | ✔ |
| `PUT /users/me/photo` | `objectKey` | 200 perfil actualizado | 400, 403 objeto ajeno, 404 no existe en S3 | Usuario | ✔ |
| `POST /devices` | `token, platform` (`android`\|`ios`) | 201 creado / 200 actualizado | 400 | Usuario | ➕ |
| `DELETE /devices/:token` | — | 204 (también si ya no existía) | 403 token de otro usuario | Usuario sobre su token | ➕ |

`POST /devices` hace *upsert* por `token`: si el mismo token estaba asociado a otro usuario (el teléfono cambió de cuenta), se reasigna al usuario del JWT.

`GET /users/me` **no tiene 404**: el registro crea el usuario y `authenticate` responde 401 si el usuario ya no existe, así que ese caso no se puede alcanzar.

#### Perfil de usuario

Respuesta de `GET`/`PUT /users/me`, `register` y `login` (solo la ve su dueño):

```json
{
  "id": "665f1c2a9b1e8a0012345678",
  "email": "ana@um.edu.uy",
  "name": "Ana Pérez",
  "birthDate": "2001-03-09",
  "age": 25,
  "university": "Universidad de Montevideo",
  "neighborhood": "Pocitos",
  "city": "Montevideo",
  "interests": ["futbol", "cine"],
  "reputation": 0,
  "photoUrl": "https://…/users/665f…/0b7d….jpg?X-Amz-…",
  "profileComplete": true,
  "createdAt": "2026-10-11T15:00:00.000Z"
}
```

- Los campos opcionales sin valor van en `null` (`birthDate`, `age`, `university`, `neighborhood`, `city`, `photoUrl`). Nunca salen `passwordHash` ni nada de sesiones.
- `birthDate`: día del calendario `YYYY-MM-DD` (sin hora ni zona). Debe existir, no ser futura y dar una edad de 16 a 100 años, contando "hoy" en la zona `America/Montevideo`. En Mongo es un `Date` a medianoche UTC.
- `age`: **calculada** por el servidor (cumpleaños, años bisiestos; quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos). Solo lectura: mandarla en un body es 400.
- `neighborhood` (barrio) y `city` (localidad): texto libre, `trim`, 1 a 60 caracteres, opcionales. `university`: 1 a 120. `name`: 1 a 80.
- `interests`: hasta 5, sin repetir, de la lista cerrada `futbol, running, estudio, musica, cine, juegos-de-mesa` (lista inicial, [pendiente de cerrar](../pendientes.md#d-notas-del-sprint-2)). Un valor fuera de la lista es 400.
- `profileComplete`: `name` + `birthDate` + al menos 1 interés. Sin perfil completo, `POST /plans` responde 409 `PROFILE_INCOMPLETE`. `university`, `neighborhood` y `city` son opcionales y no cuentan.
- `photoUrl`: URL `GET` firmada de 10 minutos; cambia en cada respuesta.
- `birthDate`, `age`, `neighborhood` y `city` **no se exponen a otros usuarios** (la vista pública solo lleva `id`, `name` y `photoUrl`) y no se loguean.
- `PUT /users/me` es un cambio parcial: lo que no se manda no cambia. Todavía no hay forma de borrar `university`, `neighborhood` ni `city` ([pendiente](../pendientes.md#d-notas-del-sprint-2)).

### Planes

| Método y ruta | Body / query | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /plans` | `from, to, university, near=lng,lat, radiusKm, limit, cursor` | 200 paginado; con `near`, ordenado por score de recomendación | 400 | Usuario | ✔ |
| `GET /plans/:id` | — | 200 detalle + cupos disponibles | 404 | Usuario | ✔ |
| `POST /plans` | `title, description, startsAt, location, capacity` (+ `interests` y campos de check-in ❓) | 201 | 400, 409 `PROFILE_INCOMPLETE` | Usuario con perfil | ✔ |
| `PATCH /plans/:id` | Campos editables, parciales | 200 | 400, 403, 404, 409 `CAPACITY_BELOW_PARTICIPANTS` | Creador | ✔ |
| `PUT /plans/:id/photo` | `objectKey` | 200 | 400, 403, 404 | Creador | ✔ |
| `POST /plans/:id/join` | — | 201 inscripción | 404, 409 `PLAN_FULL` / `ALREADY_JOINED` / `PLAN_CLOSED` | Usuario | ✔ |
| `DELETE /plans/:id/join` | — | 204 (también si no estaba) | 404, 409 si ya no admite bajas | Usuario sobre su inscripción | ✔ |
| `POST /plans/:id/qr` | — | 201 `{ qrToken, expiresAt }` | 403, 404, 409 fuera de horario | Creador | ✔ |
| `POST /plans/:id/check-in` | `qrToken, latitude, longitude, accuracyMeters` | 201 asistencia | 400, 403 `QR_INVALID`/`OUT_OF_RANGE`, 404, 409 `ALREADY_CHECKED_IN`/`CHECKIN_WINDOW_CLOSED` | Participante activo | ✔ |

> El check-in recibe `latitude`/`longitude` sueltas (no GeoJSON) tal como define el informe; el back las convierte. Es la única excepción al orden `[lng, lat]`.

### Chat

| Método y ruta | Body / query | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /plans/:id/messages` | `limit, cursor` | 200 paginado (más nuevo primero) | 403, 404 | Participante o creador | ✔ |
| `POST /plans/:id/messages` | `text` (1–2000) | 201 | 400, 403, 404 | Participante o creador | ✔ |

Eventos Socket.io: ver [08-tiempo-real-y-push.md](08-tiempo-real-y-push.md).

### Reportes y cargas

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `POST /reports` | `targetType` (`user`\|`plan`\|`message`), `targetId, reason, description` | 201 `{ id, status }` | 400, 404 | Usuario | ✔ |
| `POST /uploads/presign` | `contentType, sizeBytes` (+ `planId?` desde S3) | 200 `{ url, objectKey, expiresAt }` | 400, 403 | Usuario; creador si `planId` | ✔ |

`presign`: `contentType` ∈ `image/jpeg`, `image/png`, `image/webp`; `sizeBytes` entero de 1 a 5 242 880 (5 MB). La `objectKey` la genera el back (`users/<userId>/<uuid>.<ext>`); la URL `PUT` vence a los 5 minutos y lleva firmados el tipo y el tamaño. Hasta que exista el módulo de planes, un `planId` en el body es 400.

### Administración (requiere `role: admin`)

| Método y ruta | Body / query | OK | Estado |
|---|---|---|---|
| `GET /admin/reports` | `status, limit, cursor` | 200 paginado | ❓ |
| `PATCH /admin/reports/:id` | `status` (`reviewed`\|`dismissed`) | 200 | ❓ |
| `PATCH /admin/messages/:id` | `status` (`visible`\|`hidden`) | 200 | ❓ |
| `PATCH /admin/users/:id` | `status` (`active`\|`suspended`) | 200 | ❓ |
| `GET /admin/metrics` | — | 200 | ❓ |

Un usuario sin rol admin recibe 403 en cualquier `/admin/*`.

### Salud

| Ruta | Quién responde | Uso |
|------|---------------|-----|
| `GET /health` (sin prefijo, puerto 8080) | Nginx | Health check del ALB público |
| `GET /internal/health` | Express | Health check del ALB interno; 200/503 según Mongo y Redis |

## Ejemplo: crear un plan

```http
POST /api/v1/plans
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Partido de fútbol",
  "description": "Actividad recreativa para estudiantes",
  "startsAt": "2026-10-25T18:00:00-03:00",
  "location": { "label": "Cancha del campus", "type": "Point", "coordinates": [-56.16, -34.90] },
  "capacity": 10
}
```

```json
201 Created
{ "id": "507f1f77bcf86cd799439011", "title": "Partido de fútbol", "capacity": 10, "participantCount": 0, "status": "open" }
```

Coordenadas de ejemplo en Montevideo (`[lng, lat]`). El `creatorId` sale del token; crear un plan no consume cupo.

## Versionado del contrato

- Cambios **compatibles** (campo nuevo opcional en respuesta, endpoint nuevo) → misma versión `/api/v1`.
- Cambios **incompatibles** (renombrar/eliminar campo, cambiar tipo o significado de un código) → `/api/v2` y convivencia hasta que la app vieja deje de usarse.
- Todo cambio de contrato actualiza este archivo **en el mismo PR** y tiene test de contrato.
