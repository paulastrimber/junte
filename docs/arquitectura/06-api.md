# 06 · API

Contrato público publicado por Nginx bajo `/api/v1`. El back lo atiende bajo `/internal` (misma ruta relativa). Las rutas de esta tabla son relativas a `/api/v1`.

> Leyenda de estado: **✔ informe** = definido en el informe · **➕ revisión** = agregado por la revisión del informe · **❓ propuesto** = necesario pero no definido; validar con el equipo antes de implementar ([pendientes](../pendientes.md)).

## Convenciones

- Todas las rutas requieren `Authorization: Bearer <access_token>` salvo `POST /auth/register`, `/auth/login`, `/auth/refresh` y `GET /health`.
- Cuerpos `application/json`; fechas ISO 8601 con zona horaria; IDs como strings; campos en inglés; coordenadas `[lng, lat]`.
- **Campos solo-backend** (se ignoran o se rechazan con 400 si vienen en un body): `id`, `creatorId`, `senderId`, `userId`, `reporterId`, `reputation`, `role`, `status` de usuario, `noShow`, `noShowAt`, `participantCount`, `university` del plan, `qrNonceHash`.
- Los esquemas Zod son **estrictos** (`.strict()`): un campo desconocido es 400, no se descarta en silencio.

### Paginación

`?limit=` (default 20, máx 100) y `?cursor=`. Respuesta: `{ "items": [...], "nextCursor": "..." | null }`.
El cursor es **opaco** (base64url de la última clave de orden, p. ej. `{ createdAt, _id }`): el cliente nunca lo arma ni lo interpreta.

### Errores

`{ "code": "PLAN_FULL", "message": "El plan no tiene cupos disponibles", "requestId": "…" }`

| HTTP | Cuándo | Ejemplos de `code` |
|------|--------|--------------------|
| 400 | Validación de formato o dominio | `VALIDATION_ERROR` (+ `details` con campos) |
| 401 | Token ausente, inválido, vencido o revocado; login fallido; cuenta suspendida | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED` |
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
| `POST /auth/register` | `name, email, password, university, interests` | 201 `{ user, accessToken, refreshToken }` | 400, 409 `EMAIL_TAKEN` | Pública | ✔ |
| `POST /auth/login` | `email, password` | 200 `{ accessToken, refreshToken }` | 401 | Pública | ✔ |
| `POST /auth/refresh` | `refreshToken` | 200 tokens rotados | 401 | Pública | ✔ |
| `POST /auth/logout` | `refreshToken` | 204 (revoca el refresh) | 401 | Usuario | ❓ |

### Usuario y dispositivos

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /users/me` | — | 200 perfil propio | 404 | Usuario | ✔ |
| `PUT /users/me` | `name, university, interests` | 200 | 400 | Usuario sobre su perfil | ✔ |
| `PUT /users/me/photo` | `objectKey` | 200 | 400, 403 objeto ajeno, 404 | Usuario | ✔ |
| `POST /devices` | `token, platform` (`android`\|`ios`) | 201 creado / 200 actualizado | 400 | Usuario | ➕ |
| `DELETE /devices/:token` | — | 204 (también si ya no existía) | 403 token de otro usuario | Usuario sobre su token | ➕ |

`POST /devices` hace *upsert* por `token`: si el mismo token estaba asociado a otro usuario (el teléfono cambió de cuenta), se reasigna al usuario del JWT.

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
| `POST /uploads/presign` | `contentType, sizeBytes, planId?` | 200 `{ url, objectKey, expiresAt }` | 400, 403 | Usuario; creador si `planId` | ✔ |

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
