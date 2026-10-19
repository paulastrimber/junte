# 06 · API

Contrato público publicado por Nginx bajo `/api/v1`. El back lo atiende bajo `/internal` (misma ruta relativa). Las rutas de esta tabla son relativas a `/api/v1`.

> Leyenda de estado: **✔ informe** = definido en el informe · **➕ revisión** = agregado por la revisión del informe · **❓ propuesto** = necesario pero no definido; validar con el equipo antes de implementar ([pendientes](../pendientes.md)).

## Convenciones

- Todas las rutas requieren `Authorization: Bearer <access_token>` salvo `POST /auth/register`, `/auth/login`, `/auth/refresh` y `GET /health`. Las URLs son sensibles a mayúsculas y a la barra final: `/auth/Login` y `/auth/login/` no existen (404).
- Cuerpos `application/json`; fechas ISO 8601 con zona horaria; IDs como strings; campos en inglés; coordenadas `[lng, lat]`.
- **Campos solo-backend** (se ignoran o se rechazan con 400 si vienen en un body): `id`, `creatorId`, `senderId`, `userId`, `reporterId`, `reputation`, `role`, `status` de usuario, `age` (se calcula desde `birthDate`), `photoKey`, `noShow`, `noShowAt`, `noShowCount`, `participantCount`, `availableSpots`, `isFull`, `university` del plan, `qrNonceHash`, `checkInOpensAt`, `checkInClosesAt` y `attendanceClosedAt`. El `status` del plan solo acepta los valores que puede pedir el creador ([estado del plan](#estado-del-plan)).
- Los esquemas Zod son **estrictos** (`.strict()`): un campo desconocido es 400, no se descarta en silencio.

### Paginación

`?limit=` (default 20, máx 100) y `?cursor=`. Respuesta: `{ "items": [...], "nextCursor": "..." | null }`.
El cursor es **opaco** (base64url de la última clave de orden, p. ej. `{ createdAt, _id }`; en el feed por recomendación, la posición en el ranking): el cliente nunca lo arma ni lo interpreta. Un cursor inválido es 400.

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
| `POST /auth/register` | `name, email, password` + opcional `deviceLabel` | 201 `{ user, accessToken, refreshToken }` | 400, 409 `EMAIL_TAKEN` | Pública | ✔ |
| `POST /auth/login` | `email, password` + opcional `deviceLabel` | 200 `{ user, accessToken, refreshToken }` | 400, 401 `INVALID_CREDENTIALS` / `ACCOUNT_SUSPENDED` | Pública | ✔ |
| `POST /auth/refresh` | `refreshToken` | 200 `{ accessToken, refreshToken }` rotados | 400, 401 `UNAUTHENTICATED` / `ACCOUNT_SUSPENDED` | Pública | ✔ |
| `POST /auth/logout` | — | 204: cierra la sesión del access token (idempotente) | 401 | Usuario | ➕ |
| `POST /auth/logout-all` | — | 204: cierra todas las sesiones del usuario | 401 | Usuario | ➕ |

- `login` devuelve también `user` (el informe solo listaba los tokens): la app evita un `GET /users/me` extra.
- `password`: 8 a 128 caracteres. `name`: 1 a 80. `email`: válido, hasta 254, se normaliza (trim + minúsculas). El resto del perfil (fecha de nacimiento, estudios, zona, intereses, foto) se completa después, en el onboarding. `deviceLabel`: 1 a 60 caracteres, solo para identificar la sesión ("android", "ios").
- Un usuario puede tener sesión en varios dispositivos a la vez (máximo 5 activas; al abrir la sexta se cierra la más antigua). Ver [ADR-0008](adr/0008-sesiones-multiples.md).
- Reglas del refresh: cada uso rota el par. Reutilizar un refresh ya rotado cierra **esa** sesión y responde 401 (no afecta a las de otros dispositivos). Dos refresh simultáneos con el mismo token: uno gana y el otro se trata como reuso, por eso la app hace un solo refresh en vuelo.
- `logout` y `logout-all` se autentican con el access token (el `sid` va en el token). Tras el logout el access token sigue valiendo hasta que vence (≤ 15 min); el refresh deja de servir en el acto.
- Rate limit de Nginx: zona estricta (10 req/min por IP) solo en `login` y `register`; el resto usa la zona general.

### Usuario y dispositivos

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /users/me` | — | 200 perfil propio (+ `noShowCount`) | 401 | Usuario | ✔ |
| `GET /users/me/plans` | `role` (`created`\|`joined`), `when` (`upcoming`\|`past`), `limit, cursor` | 200 paginado de planes, con `myParticipation` | 400, 401 | Usuario | ➕ |
| `PUT /users/me` | cualquiera de `name, birthDate, university, career, city, neighborhood, interests, onboardingCompleted` (cambio parcial, al menos uno) | 200 perfil actualizado | 400 | Usuario sobre su perfil | ✔ |
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
  "university": "um",
  "career": "ingenieria-en-informatica",
  "city": "montevideo",
  "neighborhood": "pocitos",
  "interests": ["futbol", "cine"],
  "reputation": 0,
  "noShowCount": 0,
  "photoUrl": "https://…/users/665f…/0b7d….jpg?X-Amz-…",
  "profileComplete": true,
  "onboardingCompleted": true,
  "createdAt": "2026-10-11T15:00:00.000Z"
}
```

- Los campos opcionales sin valor van en `null` (`birthDate`, `age`, `university`, `career`, `city`, `neighborhood`, `photoUrl`). Nunca salen `passwordHash` ni nada de sesiones.
- `birthDate`: día del calendario `YYYY-MM-DD` (sin hora ni zona). Debe existir, no ser futura y dar una edad de 16 a 100 años, contando "hoy" en la zona `America/Montevideo`. En Mongo es un `Date` a medianoche UTC.
- `age`: **calculada** por el servidor (cumpleaños, años bisiestos; quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos). Solo lectura: mandarla en un body es 400.
- `university`, `career`, `city`, `neighborhood` e `interests` son **keys de los [catálogos](#catálogos)** (`um`, `padel`…), no texto libre. La opción **"Otra"** es la key reservada `other` (universidad, carrera, ciudad y barrio), sin texto libre. `name`: 1 a 80.
- Reglas de los catálogos (todas dan 400 `VALIDATION_ERROR` con `details` por campo):
  - La opción tiene que existir y estar activa. Una que el admin desactivó no se puede elegir de nuevo, pero quien ya la tenía la conserva.
  - La `career` tiene que ser de la `university` elegida; exige universidad, y con universidad `other` no hay carreras para elegir.
  - El `neighborhood` tiene que ser de la `city` elegida; exige una ciudad del catálogo (con `other` no hay barrios).
  - Al cambiar la `university` se quita la `career` (y al cambiar la `city`, el `neighborhood`), salvo que lleguen nuevos en el mismo pedido.
  - `interests`: hasta 10, sin repetir. Algunas opciones tienen edad mínima (`minAge`, hoy 18 en "Bares y cervecerías" y "Salir a bailar"): un menor, o quien todavía no cargó su fecha de nacimiento, no las puede elegir; y no se puede bajar la edad por debajo de la mínima de una opción elegida.
- `profileComplete`: `name` + `birthDate` + al menos 1 interés. Sin perfil completo, `POST /plans` responde 409 `PROFILE_INCOMPLETE`. Universidad, carrera, ciudad y barrio son opcionales y no cuentan.
- `onboardingCompleted`: la persona terminó **o dejó para después** el onboarding. Se marca mandando `onboardingCompleted: true` (solo `true`: no se puede deshacer) y, mientras sea `false`, la app muestra el onboarding. Es independiente de `profileComplete`: se puede saltar todo y el perfil sigue incompleto.
- `photoUrl`: URL `GET` firmada de 10 minutos; cambia en cada respuesta.
- `birthDate`, `age`, `city` y `neighborhood` **no se exponen a otros usuarios** y no se loguean. La **vista pública** de un usuario (creador de un plan, anotados) lleva solo `id`, `name`, `photoUrl` y `reputation`.
- `reputation`: +1 por cada check-in válido; solo la escribe el back y es pública. `noShowCount`: cantidad de ausencias propias (inscripciones marcadas `noShow`). **Solo sale en `GET /users/me`** (no en `PUT`, registro ni login) y nunca se muestra a otros usuarios.
- `PUT /users/me` es un cambio parcial: lo que no se manda no cambia. No hay forma de dejar vacío un campo ya elegido (solo cambiarlo por otro, incluida "Otra").

### Catálogos

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /catalogs` | — | 200 catálogos activos, anidados | 401 | Usuario | ➕ |

```json
{
  "version": "3f9a1c0b7e2d",
  "interestCategories": [
    { "key": "deportes", "name": "Deportes", "interests": [{ "key": "padel", "name": "Pádel" }] },
    { "key": "salidas-y-gastronomia", "name": "Salidas y gastronomía",
      "interests": [{ "key": "bares-y-cervecerias", "name": "Bares y cervecerías", "minAge": 18 }] }
  ],
  "universities": [
    { "key": "um", "name": "Universidad de Montevideo", "shortName": "UM",
      "careers": [{ "key": "ingenieria-en-informatica", "name": "Ingeniería en Informática", "group": "Facultad de Ingeniería" }] }
  ],
  "cities": [
    { "key": "montevideo", "name": "Montevideo", "neighborhoods": [{ "key": "pocitos", "name": "Pocitos" }] }
  ]
}
```

- Solo lo **activo**, en orden, sin campos internos. `version` cambia cuando cambia el contenido (clave de caché de la app). `Cache-Control: private, max-age=300`.
- "Otra" no viene en la respuesta: la agrega la app (key `other`).
- Los catálogos los edita el admin (S6); un cambio se ve en todas las instancias en menos de un minuto (caché de lectura de 60 s por instancia). Detalle en [ADR-0009](adr/0009-catalogos-en-la-base.md) y [07](07-modelo-de-datos.md#catálogos).

### Planes

| Método y ruta | Body / query | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /plans` | Filtros (`from, to, university, interests, priceRanges, availability`) + `near=lng,lat, radiusKm, limit, cursor` | 200 paginado: por fecha; con `near`, por score de recomendación | 400 | Usuario | ✔ |
| `GET /plans/filters` | — | 200 opciones de los filtros (rangos de precio, radio) | 401 | Usuario | ➕ |
| `POST /feed` | Filtros + `near: [lng, lat], radiusKm, calendar, limit, cursor` | 200 paginado por score de recomendación | 400 | Usuario | ➕ |
| `GET /plans/:id` | — | 200 detalle + cupos disponibles | 400, 404 | Usuario (si el plan le es visible) | ✔ |
| `POST /plans` | `title, startsAt, endsAt, location, interests` + opcionales `description, capacity, price, checkInRadiusMeters` | 201 plan | 400, 409 `PROFILE_INCOMPLETE` | Usuario con perfil completo | ✔ |
| `PATCH /plans/:id` | Cualquiera de los campos de `POST` (cambio parcial, al menos uno), **o** solo `status` | 200 plan | 400, 403, 404, 409 `CAPACITY_BELOW_PARTICIPANTS` / `PLAN_CLOSED` | Creador | ✔ |
| `PUT /plans/:id/photo` | `objectKey` | 200 plan | 400, 403, 404 | Creador | ✔ |
| `POST /plans/:id/join` | — (cualquier campo es 400) | 201 `{ planId, status, joinedAt }` | 404, 409 `PLAN_FULL` / `ALREADY_JOINED` / `PLAN_CLOSED` | Usuario | ✔ |
| `DELETE /plans/:id/join` | — | 204 (también si no estaba) | 404, 409 `PLAN_CLOSED` si ya no admite bajas | Usuario sobre su inscripción | ✔ |
| `GET /plans/:id/participants` | `limit, cursor` | 200 paginado de anotados (`id, name, photoUrl, reputation`) | 400, 403, 404 | Participante activo o creador | ➕ |
| `POST /plans/:id/qr` | — | 201 `{ qrToken, expiresAt }` | 403, 404, 409 `CHECKIN_WINDOW_CLOSED` / `PLAN_CLOSED` | Creador | ✔ |
| `POST /plans/:id/check-in` | `qrToken, latitude, longitude, accuracyMeters` | 201 `{ planId, checkedInAt, method, distanceMeters }` | 400, 403 `FORBIDDEN`/`QR_INVALID`/`OUT_OF_RANGE`, 404, 409 `PLAN_CLOSED`/`ALREADY_CHECKED_IN`/`CHECKIN_WINDOW_CLOSED` | Participante activo | ✔ |

> El check-in recibe `latitude`/`longitude` sueltas (no GeoJSON) tal como define el informe; el back las convierte. Es la única excepción al orden `[lng, lat]`.

Implementados en S3: `GET /plans`, `GET /plans/filters`, `POST /feed`, `GET /plans/:id`, `POST /plans`, `PATCH /plans/:id` y `PUT /plans/:id/photo`. En S4: inscripciones, anotados, QR, check-in, el cambio de `status` y `GET /users/me/plans` (reglas en [Inscripciones y asistencia](#inscripciones-y-asistencia)).

#### Plan

Respuesta de `POST`, `GET /plans/:id`, `PATCH`, `PUT …/photo` y de cada elemento de los listados:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "title": "Partido de fútbol",
  "description": "Actividad recreativa para estudiantes",
  "startsAt": "2026-10-25T21:00:00.000Z",
  "endsAt": "2026-10-25T23:00:00.000Z",
  "location": { "label": "Cancha del campus", "type": "Point", "coordinates": [-56.16, -34.90] },
  "interests": ["futbol"],
  "university": "um",
  "capacity": 10,
  "participantCount": 0,
  "availableSpots": 10,
  "isFull": false,
  "price": 150,
  "status": "open",
  "photoUrl": null,
  "creator": { "id": "665f1c2a9b1e8a0012345678", "name": "Ana Pérez", "photoUrl": null, "reputation": 4 },
  "isCreator": true,
  "checkInOpensAt": "2026-10-25T20:45:00.000Z",
  "checkInClosesAt": "2026-10-25T22:00:00.000Z",
  "checkInRadiusMeters": 150,
  "myParticipation": { "status": "active", "joinedAt": "2026-10-20T14:00:00.000Z", "checkedInAt": null, "noShow": false },
  "distanceMeters": 812,
  "createdAt": "2026-10-12T15:00:00.000Z"
}
```

Campos que se mandan (`POST` / `PATCH`; cualquier otro campo es 400):

| Campo | Regla |
|-------|-------|
| `title` | 3 a 100 caracteres |
| `description` | Opcional, hasta 2000. Sin valor sale `null` |
| `startsAt`, `endsAt` | ISO 8601 **con zona horaria**. `startsAt` en el futuro (al crear, o si un `PATCH` lo cambia); `endsAt` posterior a `startsAt` y como máximo **7 días** después (permite campamentos). En `PATCH` se validan contra lo ya guardado |
| `location` | `{ label, coordinates: [lng, lat] }` (+ `type: "Point"` opcional). `label` obligatorio, 1 a 120. Coordenadas en rango. En `PATCH` va el objeto completo |
| `interests` | De 1 a 10 keys del catálogo `interests` (el mismo del perfil), sin repetir. Tienen que existir y estar activas; las que tienen edad mínima exigen que **el creador** la tenga. Al editar se conservan las que el plan ya tenía aunque se hayan desactivado |
| `capacity` | Entero de 1 a 500, o `null` = **cupo ilimitado**. Opcional en `POST` (por defecto `null`) |
| `price` | Costo por persona en pesos uruguayos, entero de 0 (gratis) a 100000. Opcional en `POST` (por defecto 0) |
| `checkInRadiusMeters` | Radio del check-in en metros, entero de 50 a 1000. Opcional en `POST` (por defecto 150). Es lo único de la asistencia que elige el creador |
| `status` | **Solo en `PATCH` y solo**: `closed` (cerrar inscripciones), `open` (reabrirlas) o `cancelled`. Con otros campos en el mismo body es 400. Ver [transiciones](#estado-del-plan) |

Campos que solo devuelve el back:

- `university`: la del perfil del creador al crear el plan (`null` si no tiene). `status`: `open` al crear; `completed` lo pone solo el back.
- `checkInOpensAt` y `checkInClosesAt`: la **ventana de asistencia la calcula siempre el back** (`startsAt − 15 min` a `startsAt + 60 min`, y nunca después de `endsAt`); se recalcula sola cuando cambian las fechas. Mandarlas en un body es 400.
- `myParticipation`: el estado del usuario del token en ese plan, o `null` si nunca se inscribió. `status` (`active` \| `cancelled`), `joinedAt`, `checkedInAt` (`null` si no registró su asistencia) y `noShow`. Va en el detalle (`POST`, `GET /plans/:id`, `PATCH`, `PUT …/photo`) y en `GET /users/me/plans`; **no** en los listados del feed.
- `participantCount`, `availableSpots` e `isFull`: **"lleno" se calcula** (`participantCount >= capacity`), no es un `status`. Con cupo ilimitado (`capacity: null`) `availableSpots` es `null` e `isFull` siempre `false`. Crear un plan no consume cupo: el creador se inscribe aparte.
- `creator`: vista pública del creador (`id`, `name`, `photoUrl`, `reputation`). `isCreator`: si el usuario del token es quien lo creó (la app lo usa para ofrecer "Editar").
- `photoUrl`: URL `GET` firmada de 10 minutos, o `null`. `distanceMeters`: solo en resultados por cercanía (`POST /feed`, `GET /plans?near=`), redondeada al metro.
- Nunca salen `photoKey`, `qrNonceHash`, `qrExpiresAt`, el desafío anterior (`qrPreviousNonceHash`, `qrPreviousExpiresAt`), `attendanceClosedAt` ni `creatorId` suelto.

Reglas:

- **Visibilidad** (`GET /plans/:id`, y antes de cualquier 403): un plan `open` o `closed` que todavía no terminó lo ve cualquier usuario. Uno `cancelled`, `completed` o ya terminado solo lo ven su creador y quienes tienen inscripción activa; para el resto es 404 (no se revela que existe).
- **`PATCH`**: solo el creador (403 `FORBIDDEN`) y solo mientras el plan está `open` o `closed` (si no, 409 `PLAN_CLOSED`).
- **Cupo en `PATCH`**: fijar un `capacity` menor a los inscriptos → 409 `CAPACITY_BELOW_PARTICIPANTS` (se comprueba en la misma operación que escribe). Se puede pasar de un número a `null` (ilimitado) siempre, y de `null` a un número que no sea menor a `participantCount`.
- Un plan lleno se puede ver completo, pero no admite inscripciones (`PLAN_FULL`).

#### Estado del plan

```
open ◀──▶ closed ──▶ completed      (el back, al llegar endsAt; también desde open)
  │          │
  └────┬─────┘
       ▼
   cancelled                        (el creador, hasta endsAt)
```

- El creador cambia el estado con `PATCH /plans/:id { "status": … }`: `closed` cierra las inscripciones y `open` las reabre (solo **antes de `startsAt`**); `cancelled` cancela el plan (en cualquier momento **hasta `endsAt`**). Pedir el estado que ya tiene responde 200 sin cambios.
- Una transición que no corresponde (reabrir un plan que ya empezó, tocar uno cancelado o completado) → 409 `PLAN_CLOSED`. `cancelled` y `completed` son finales.
- `closed` **solo impide inscripciones nuevas**: las bajas, el QR y el check-in siguen funcionando, y no marca ausencias.
- En un plan cancelado no hay altas, bajas, QR ni check-in. Las inscripciones quedan como estaban; los check-ins, la reputación y las ausencias ya registradas se conservan.
- `completed` lo pone un job del back cuando llega `endsAt`.

#### Inscripciones y asistencia

**Inscribirse (`POST /plans/:id/join`).** El plan tiene que estar `open`, no haber empezado y tener lugar. Vale igual para quien se había dado de baja (se reactiva su misma inscripción). El creador no ocupa cupo al crear: se inscribe como cualquiera. Motivo del rechazo, en orden: plan inexistente o no visible → 404; no está `open` o ya empezó → 409 `PLAN_CLOSED`; sin lugar → 409 `PLAN_FULL` (nunca con cupo ilimitado); ya inscripto → 409 `ALREADY_JOINED`.

**Darse de baja (`DELETE /plans/:id/join`).** Con el plan `open` o `closed` y antes de `startsAt`. Idempotente: sin inscripción activa responde 204. Responde 409 `PLAN_CLOSED` si el plan ya empezó, está cancelado o completado, o si la persona **ya registró su asistencia**.

**Anotados (`GET /plans/:id/participants`).** Inscripciones activas, por orden de inscripción: `{ items: [{ id, name, photoUrl, reputation }], nextCursor }`. Solo para participantes activos y el creador (403 `FORBIDDEN` para el resto; 404 si el plan no le es visible). Nunca incluye ausencias.

**QR (`POST /plans/:id/qr`).** Solo el creador, con el plan `open` o `closed` y dentro de la ventana de asistencia. Devuelve un desafío aleatorio (`qrToken`) que vence a los **90 segundos** (o al cerrar la ventana, lo que pase primero). Pedir otro lo reemplaza: **el anterior sigue valiendo 10 segundos más** (nunca más allá de su propio vencimiento), para que quien lo escaneó justo en el cambio no tenga que repetir. Solo se conserva uno: el anterior al anterior deja de valer. El back guarda solo el hash. `Cache-Control: no-store`.

**Check-in (`POST /plans/:id/check-in`).** Validaciones, en orden:

| # | Regla | Si falla |
|---|-------|----------|
| 1 | Formato del body (estricto) | 400 `VALIDATION_ERROR` |
| 2 | El plan existe y le es visible | 404 `NOT_FOUND` |
| 3 | Inscripción activa | 403 `FORBIDDEN` |
| 4 | Plan `open` o `closed` | 409 `PLAN_CLOSED` |
| 5 | Todavía no registró su asistencia | 409 `ALREADY_CHECKED_IN` |
| 6 | Dentro de la ventana (`checkInOpensAt` a `checkInClosesAt`, bordes incluidos) | 409 `CHECKIN_WINDOW_CLOSED` |
| 7 | `qrToken` es el desafío vigente de **ese** plan y no venció, o el anterior dentro de sus 10 segundos de margen | 403 `QR_INVALID` |
| 8 | `accuracyMeters` ≤ 100 y distancia al lugar ≤ `checkInRadiusMeters` | 403 `OUT_OF_RANGE` |

- Si todo pasa, se registra la asistencia y se suma **+1 de reputación**, en la misma transacción. Respuesta: `{ planId, checkedInAt, method, distanceMeters }` (`distanceMeters` redondeada).
- **La ubicación no se guarda**: solo la distancia al lugar y la precisión.
- **El creador inscripto** no puede escanear su propio QR: registra su asistencia con el mismo endpoint **sin `qrToken`** (`method: "location"`), con las mismas reglas de horario, distancia y precisión. No suma reputación en ese momento: la recibe al cerrar la asistencia, solo si **al menos 2 participantes más** registraron la suya.

**Cierre de asistencia.** Cuando cierra la ventana de check-in, un job del back marca `noShow` en las inscripciones activas sin check-in (incluida la del creador, si estaba inscripto) y le da su +1 al creador si corresponde. Corre una sola vez por plan. `noShow` no resta reputación. Los planes cancelados no se procesan.

**Mis planes (`GET /users/me/plans`).** `role=created` (los que creó) o `role=joined` (inscripción activa); `when=upcoming` (todavía no terminó, del más próximo al más lejano; es el valor por defecto) o `when=past` (ya terminó, del más reciente al más viejo). Incluye planes en cualquier estado, también cancelados y completados. Cada elemento es un [plan](#plan) con `myParticipation`.

#### Listados y filtros

`GET /plans` y `POST /feed` devuelven `{ items: [plan…], nextCursor }` con planes **abiertos que todavía no empezaron**. Son para descubrir planes: **no traen los que creó el usuario ni aquellos en los que tiene inscripción activa** (esos están en `GET /users/me/plans`); quien se da de baja vuelve a verlo. Los filtros son **predefinidos**: el cliente elige valores y el back arma la consulta (un filtro desconocido es 400).

| Filtro | `GET /plans` (query) | `POST /feed` (body) | Qué hace |
|--------|----------------------|---------------------|----------|
| Fecha | `from`, `to` (ISO 8601 con zona) | igual | `startsAt` dentro del rango; `to` posterior a `from` |
| Universidad | `university=um` | `"university": "um"` | Planes de creadores de esa universidad |
| Intereses | `interests=futbol,cine` | `"interests": ["futbol", "cine"]` | Hasta 10; el plan tiene **al menos uno** |
| Costo | `priceRanges=free,low` | `"priceRanges": ["free", "low"]` | Uno o varios rangos; el precio cae en alguno |
| Cupo | `availability=available` \| `full` | igual | Por defecto `available` (con lugar, incluye cupo ilimitado). `full` trae solo los llenos: van en una sección aparte de la app |

- **Rangos de precio** (pesos uruguayos): `free` = $0, `low` = $1–500, `mid` = $501–1000, `high` = más de $1000. Se definen en un solo lugar del back (`PRICE_RANGES` en `plans/plan.rules.js`) y la app los lee de `GET /plans/filters` para armar sus textos: cambiar los límites no requiere tocar la app.
- `GET /plans/filters` → `{ "priceRanges": [{ "key": "free", "min": 0, "max": 0 }, …, { "key": "high", "min": 1001, "max": null }], "radiusKm": { "min": 0.5, "max": 50, "default": 10 } }`.
- **Sin `near`** (`GET /plans`): orden por `startsAt` y `_id` ascendentes; cursor sobre esa clave.
- **Con `near`** (`GET /plans?near=lng,lat` o `POST /feed`): orden por **score de recomendación**. `radiusKm` de 0.5 a 50 (por defecto 10); en el query solo se acepta junto con `near`.
- `limit` de 1 a 100 (por defecto 20). Un `cursor` manipulado, o que corresponde a otra búsqueda (otros filtros, otro radio, otra posición), es 400.

#### Feed de recomendación (`POST /feed`)

```http
POST /api/v1/feed
{ "near": [-56.1645, -34.9011], "radiusKm": 10, "priceRanges": ["free", "low"],
  "calendar": { "from": "2026-10-12T15:00:00Z", "to": "2026-11-11T15:00:00Z",
                "busy": [{ "start": "2026-10-13T18:00:00-03:00", "end": "2026-10-13T19:00:00-03:00" }] } }
```

- Va por **body** y no por query para que la posición y las franjas del calendario no queden en los logs de acceso de Nginx ni del ALB. No se persiste ni se loguea nada de eso. Responde con `Cache-Control: no-store`.
- `calendar` es **opcional**: la app lo manda solo si la persona dio permiso de calendario. `from`/`to` es el período que la app leyó (hasta 31 días); `busy`, hasta 200 franjas con **solo inicio y fin** (un campo extra, como el título del evento, es 400).
- Score: `0.5 · Jaccard(intereses del usuario, intereses del plan) + 0.3 · P(d) + 0.2 · H(u, p)`. `P(d)` va de 1 (distancia 0) a 0 (borde del radio). Los pesos salen de `FEED_WEIGHTS` (JSON `{"interests":0.5,"distance":0.3,"schedule":0.2}`, suman 1): cambiarlos no cambia el contrato.
- `H(u, p)` — compatibilidad horaria con el horario del plan (`startsAt`–`endsAt`):
  - **0** si se superpone con una franja ocupada. Cuentan las franjas de `calendar` **y los planes en los que el usuario ya está inscripto** (eso el back lo sabe sin permiso de calendario).
  - **1** si no se superpone y el período de `calendar` cubre todo el horario del plan.
  - **0.5** (neutral) si no se sabe: no se mandó `calendar`, o el plan cae fuera del período leído.
- `GET /plans?near=` usa el mismo ranking, sin calendario (pero sí con los planes inscriptos).
- **Paginación**: se rankean hasta 200 candidatos (los más cercanos dentro del radio) y el cursor opaco guarda la posición en ese ranking y el instante de la primera página, de modo que el conjunto de candidatos no cambia entre páginas. Límite aceptado: un plan creado después de la primera página aparece recién al refrescar. Ver [ADR-0010](adr/0010-feed-por-ranking.md).

### Chat

| Método y ruta | Body / query | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `GET /plans/:id/messages` | `limit, cursor` | 200 paginado (más nuevo primero) | 400, 403, 404 | Participante activo o creador | ✔ |
| `POST /plans/:id/messages` | `text` (1–2000), `clientId?` | 201 creado / 200 reintento | 400, 403, 404 | Participante activo o creador | ✔ |

```json
{ "id": "6710…", "planId": "507f1f77bcf86cd799439011", "sender": { "id": "665f…", "name": "Beto", "photoUrl": null, "reputation": 3 },
  "type": "text", "text": "¿Alguien lleva pelota?", "clientId": "m2k9x1-4f8a2c1d", "createdAt": "2026-10-14T19:30:00.000Z" }
```

- **Permiso:** el participante con inscripción activa o el creador del plan (aunque no esté inscripto), en cualquier estado del plan. Plan inexistente o no visible para el usuario → 404; visible pero sin pertenecer → 403. Quien se da de baja pierde el acceso (403) y deja de recibir los mensajes en tiempo real.
- **`text`** se recorta antes de validar: vacío o de solo espacios → 400. El `senderId` sale del token; cualquier otro campo (`senderId`, `status`…) es 400.
- **`clientId`** (opcional, 1–64 caracteres `[A-Za-z0-9_-]`): lo genera la app para cada mensaje. Si el mismo remitente lo repite, el back **no crea otro mensaje**: responde **200** con el que ya existía (también si el primero entró por Socket.io). El mismo `clientId` en otro plan es 400.
- **Historial:** solo mensajes `visible`, del más nuevo al más viejo; cursor sobre `createdAt` + `id` (estable aunque haya mensajes en el mismo milisegundo). `Cache-Control: no-store`. `sender` es la vista pública del usuario (`null` si ya no existe); `status` no sale. `type` hoy es siempre `text` (las notas de voz sumarán `voice`).
- Un mensaje creado por REST también se emite por Socket.io (`chat:message`) a la sala del plan.

Eventos Socket.io: ver [08-tiempo-real-y-push.md](08-tiempo-real-y-push.md#eventos).

### Reportes y cargas

| Método y ruta | Body | OK | Errores | Permiso | Estado |
|---|---|---|---|---|---|
| `POST /reports` | `targetType` (`user`\|`plan`\|`message`), `targetId, reason, description` | 201 `{ id, status }` (200 si ya había uno pendiente) | 400, 404 | Usuario | ✔ S6 |
| `POST /uploads/presign` | `contentType, sizeBytes` + opcional `planId` | 200 `{ url, objectKey, expiresAt }` | 400, 403, 404 | Usuario; creador si `planId` | ✔ |

**Reportes (S6).** El `reporterId` sale del token (en el body es 400). `reason` ∈ `spam`, `harassment`, `inappropriate`, `scam`, `other`; `description` opcional, se recorta, hasta 500 caracteres y **obligatoria con `other`**. El objetivo tiene que existir y ser accesible para quien reporta; si no, **404** (no se revela que existe):

- `user`: la cuenta existe.
- `plan`: el plan le es visible (las mismas reglas que `GET /plans/:id`).
- `message`: el mensaje está visible y es de un chat del que es parte (participante activo o creador).
- Reportar algo propio (a sí mismo, su plan o su mensaje) es 400.
- La misma persona sobre lo mismo, mientras el reporte siga pendiente, recibe **200 con el reporte que ya existía** (no se crea otro). Una vez resuelto, puede volver a reportarlo.
- Un reporte nunca es visible para otros usuarios: no hay `GET /reports` (404); solo lo lista el panel de administración. En el log va `reportId`, `reporterId`, `targetType` y `reason`, nunca la descripción.

`presign`: `contentType` ∈ `image/jpeg`, `image/png`, `image/webp`; `sizeBytes` entero de 1 a 5 242 880 (5 MB). La `objectKey` la genera el back; la URL `PUT` vence a los 5 minutos y lleva firmados el tipo y el tamaño.

- Sin `planId`: foto de perfil, clave `users/<userId>/<uuid>.<ext>`; se vincula con `PUT /users/me/photo`.
- Con `planId`: foto de ese plan, clave `plans/<planId>/<uuid>.<ext>`. Solo su creador (403); 404 si el plan no existe o no le es visible. Se vincula con `PUT /plans/:id/photo`, que vuelve a verificar creador, prefijo de la clave, existencia y tipo y tamaño reales (mismo flujo que la foto de perfil).

### Administración (requiere `role: admin`)

| Método y ruta | Body / query | OK | Estado |
|---|---|---|---|
| `GET /admin/reports` | `status` (`pending` por defecto \| `reviewed` \| `dismissed`), `limit, cursor` | 200 paginado | ✔ S6 |
| `PATCH /admin/reports/:id` | `status` (`reviewed`\|`dismissed`) | 200 reporte + `resolvedCount` | ✔ S6 |
| `PATCH /admin/messages/:id` | `status` (`visible`\|`hidden`) | 200 mensaje | ✔ S6 |
| `PATCH /admin/users/:id` | `status` (`active`\|`suspended`) | 200 usuario | ✔ S6 |
| `GET /admin/metrics` | — | 200 | ✔ S6 |
| `GET /admin/catalogs/:catalog` | — | 200 `{ items }` (activas e inactivas, sin paginar: son chicos) | ✔ S6 |
| `POST /admin/catalogs/:catalog` | `key`, `name`, `order?`, `active?` + los propios del catálogo | 201 fila | ✔ S6 |
| `PATCH /admin/catalogs/:catalog/:id` | `name`, `order`, `active` + `minAge` (intereses), `shortName` (universidades), `group` (carreras), `department` (ciudades) | 200 fila | ✔ S6 |

Un usuario sin rol admin recibe **403** en cualquier `/admin/*` (exista la ruta o no); sin token, 401. El rol se comprueba en el router (`requireRole('admin')`) y otra vez en el servicio, leyendo el usuario en cada request (quitarle el rol tiene efecto en el acto). Todas las respuestas llevan `Cache-Control: no-store`. Decidido con Domenico el 2026-10-14 ([pendientes](../pendientes.md#endpoints-y-métricas-de-administración)).

- **Vista de un usuario para el admin:** `{ id, name, email, role, status, reputation, createdAt }` (nunca hashes, sesiones, fecha de nacimiento ni barrio).
- **Cola de reportes:** pendientes del más viejo al más nuevo (orden de llegada); revisados y descartados, del más nuevo al más viejo. Cursor opaco que incluye el estado (uno de otra pestaña es 400). Cada ítem: `{ id, status, reason, description, createdAt, resolvedAt, resolvedBy: { id, name } | null, reporter, target: { type, id, pendingReports, preview } }`. `pendingReports` cuenta los pendientes de cualquier persona sobre lo mismo. `preview` es lo reportado, leído en el momento (null si ya no existe):
  - `user`: la vista de admin del usuario.
  - `plan`: `{ id, title, description, status, startsAt, locationLabel, creator }`.
  - `message`: `{ id, planId, type, text, status, createdAt, sender, plan: { id, title } }` (el admin ve también los ocultos).
- **Resolver:** si el reporte estaba pendiente, se resuelven **todos** los pendientes sobre el mismo objetivo (la decisión es sobre el contenido, no sobre quién lo reportó) y `resolvedCount` dice cuántos. Uno ya resuelto se puede corregir (revisado ↔ descartado), nunca volver a pendiente.
- **Ocultar un mensaje:** deja de salir en el historial y se emite `chat:hidden` a la sala del plan. Volver a mostrarlo lo devuelve al historial.
- **Suspender:** `authenticate` ya rechaza al usuario en cada request; además se revocan todas sus sesiones y se cierran sus conexiones de Socket.io. Sus planes e inscripciones **no cambian** (es reversible: reactivar lo deja como antes). 403 al suspenderse a sí mismo o a otra cuenta admin (primero hay que quitarle el rol con el script). Reactivar no restaura sesiones: vuelve a iniciar sesión.
- **Métricas:** `{ generatedAt, since, windowDays: 7, users: { total, createdSince, suspended }, plans: { total, createdSince }, participations: { active, joinedSince }, checkIns: { total, createdSince }, messages: { total, createdSince, hidden }, reports: { pending, createdSince } }`. `createdSince` = desde `since` (hace 7 días).
- **Catálogos:** la `key` (kebab-case, hasta 80, nunca `other`) y el "padre" (`categoryKey`, `universityKey`, `cityKey`, que tiene que existir) se eligen al crear y no cambian. Las filas se identifican por `id` (la key de carreras y barrios solo es única dentro de su universidad o ciudad). `null` quita un campo opcional (`minAge`, `group`). Key repetida → 409 `CATALOG_KEY_TAKEN`. Nunca se borra: se desactiva. El cambio se ve en `GET /catalogs` de esa instancia enseguida y en las demás en menos de un minuto.
- **Primer admin:** no hay endpoint. `npm run admin -- promote <email>` (o `create <email> "<nombre>"` con `ADMIN_PASSWORD` en el entorno, o `demote`), o `task db:admin -- …`.

### Salud

| Ruta | Quién responde | Uso |
|------|---------------|-----|
| `GET /health` (sin prefijo, puerto 8080) | Nginx | Health check del ALB público |
| `GET /internal/health` | Express | Health check del ALB interno; 503 solo si MongoDB no responde (la app lo llama como `GET /api/v1/health`, sin token) |

Respuesta de `GET /internal/health` (`Cache-Control: no-store`, timeout de 2 s por componente; nunca incluye mensajes de error ni hosts):

| MongoDB | Redis | HTTP | Cuerpo |
|---------|-------|------|--------|
| up | up | 200 | `{ "status": "ok", "checks": { "mongo": "up", "redis": "up" } }` |
| up | down | 200 | `{ "status": "degraded", "checks": { "mongo": "up", "redis": "down" } }` |
| down | cualquiera | 503 | `{ "status": "unavailable", "checks": { "mongo": "down", "redis": "up" \| "down" } }` |

Redis no decide el código: sin Redis la API sigue funcionando (el chat pasa a polling y los jobs esperan), y un 503 haría que el ALB interno saque a todas las instancias. El estado `degraded` solo se ve en el cuerpo.

## Ejemplo: crear un plan

```http
POST /api/v1/plans
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "Partido de fútbol",
  "description": "Actividad recreativa para estudiantes",
  "startsAt": "2026-10-25T18:00:00-03:00",
  "endsAt": "2026-10-25T20:00:00-03:00",
  "location": { "label": "Cancha del campus", "type": "Point", "coordinates": [-56.16, -34.90] },
  "interests": ["futbol"],
  "capacity": 10,
  "price": 150
}
```

```json
201 Created
{ "id": "507f1f77bcf86cd799439011", "title": "Partido de fútbol", "capacity": 10, "participantCount": 0, "availableSpots": 10, "isFull": false, "price": 150, "status": "open", "…": "ver la forma completa en Plan" }
```

Coordenadas de ejemplo en Montevideo (`[lng, lat]`). El `creatorId` sale del token; crear un plan no consume cupo. Sin `capacity` (o con `null`) el cupo es ilimitado; sin `price` es gratis.

## Versionado del contrato

- Cambios **compatibles** (campo nuevo opcional en respuesta, endpoint nuevo) → misma versión `/api/v1`.
- Cambios **incompatibles** (renombrar/eliminar campo, cambiar tipo o significado de un código) → `/api/v2` y convivencia hasta que la app vieja deje de usarse.
- Todo cambio de contrato actualiza este archivo **en el mismo PR** y tiene test de contrato.
