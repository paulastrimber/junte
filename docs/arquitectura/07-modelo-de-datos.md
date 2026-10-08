# 07 · Modelo de datos (MongoDB)

Siete colecciones. Todas con `_id: ObjectId`, `createdAt` y `updatedAt` (`timestamps: true` en Mongoose). Referencias por `ObjectId`, controladas por la aplicación. Fechas como `Date`.

**Los índices y validadores se crean solo por migraciones** ([migraciones.md](../practicas/migraciones.md)); Mongoose corre con `autoIndex: false` y `autoCreate: false`.

## Colecciones

### `users`

| Campo | Tipo | Notas |
|-------|------|-------|
| `email` | string | Único, normalizado (trim + minúsculas) |
| `passwordHash` | string | Argon2id (o bcrypt). Nunca se serializa |
| `name`, `university` | string | |
| `interests` | string[] | Se usa en Jaccard del feed |
| `role` | `'user'` \| `'admin'` | **➕ revisión.** Default `user`. Solo cambia por migración/seed o por otro admin. Ver [ADR-0004](adr/0004-rol-y-estado-de-usuario.md) |
| `status` | `'active'` \| `'suspended'` | **➕ revisión.** El middleware JWT exige `active` (el informe pide verificar "estado del usuario" pero no definía el campo) |
| `reputation` | number | Default 0. Solo la escribe el back |
| `refreshTokenHash` | string? | Hash del refresh vigente (rotación/revocación) |
| `photoKey` | string? | Clave del objeto en S3, no la imagen |

### `plans`

| Campo | Tipo | Notas |
|-------|------|-------|
| `title`, `description` | string | Longitudes máximas en Zod |
| `startsAt` | Date | |
| `location` | `{ label, type: 'Point', coordinates: [lng, lat] }` | Índice `2dsphere` |
| `interests` | string[] | **❓ falta en el informe.** Sin intereses del plan no se puede calcular el Jaccard del feed ([pendiente](../pendientes.md#intereses-del-plan)) |
| `university` | string | Derivada del perfil del creador |
| `capacity` | int ≥ 1 | |
| `participantCount` | int ≥ 0, ≤ `capacity` | Solo el back, en transacción |
| `creatorId` | ObjectId → users | Del token |
| `status` | `open` \| `closed` \| `cancelled` \| `completed` | Transiciones: ver abajo |
| `photoKey` | string? | |
| `checkInOpensAt`, `checkInClosesAt` | Date | Ventana de asistencia |
| `checkInRadiusMeters` | number | |
| `qrNonceHash`, `qrExpiresAt` | string?, Date? | Desafío QR vigente (hash SHA-256 del nonce) |

### `planParticipants`

`planId`, `userId`, `status` (`active` \| `cancelled`), `joinedAt`, `cancelledAt?`, `noShow` (default `false`), `noShowAt?`.
Un **único registro por par** plan–usuario; una baja lo pasa a `cancelled` y una nueva inscripción lo reactiva (si las reglas lo permiten, [pendiente](../pendientes.md)).

### `checkIns`

`planId`, `userId`, `checkedInAt` (hora del servidor), `method: 'qr-location'`, `distanceMeters`, `accuracyMeters`.
**No se persiste la latitud/longitud del participante.**

### `messages`

`planId`, `senderId` (del token), `text` (1–2000), `status` (`visible` \| `hidden`), `createdAt`.

### `reports`

`reporterId` (del token), `targetType` (`user` \| `plan` \| `message`), `targetId`, `reason`, `description`, `status` (`pending` \| `reviewed` \| `dismissed`), `createdAt`.

### `deviceTokens`

`userId`, `token`, `platform` (`android` \| `ios`), `updatedAt`. Se eliminan los tokens que FCM informa como inválidos.

## Índices

| Colección | Índice | Para qué |
|-----------|--------|----------|
| `users` | `{ email: 1 }` único | Sin cuentas duplicadas |
| `users` | `{ role: 1 }` | Listar administradores (colección chica; opcional) |
| `plans` | `{ status: 1, startsAt: 1 }` | Planes abiertos por fecha |
| `plans` | `{ location: '2dsphere' }` | `$geoNear` del feed |
| `plans` | `{ creatorId: 1, startsAt: -1 }` | "Mis planes" |
| `planParticipants` | `{ planId: 1, userId: 1 }` único | Sin inscripciones duplicadas |
| `planParticipants` | `{ userId: 1, status: 1 }` | "Planes a los que voy" |
| `checkIns` | `{ planId: 1, userId: 1 }` único | Una asistencia por persona |
| `messages` | `{ planId: 1, createdAt: -1, _id: -1 }` | Paginación estable del chat |
| `reports` | `{ status: 1, createdAt: 1 }` | Cola de moderación |
| `deviceTokens` | `{ token: 1 }` único | Un registro por dispositivo |
| `deviceTokens` | `{ userId: 1 }` | Enviar push a un usuario |

Los índices que no figuran en el informe (`creatorId`, `userId+status`, `deviceTokens.userId`) se agregan porque las consultas de esas pantallas los necesitan; cualquier índice nuevo entra por migración con su justificación.

## Invariantes (no se rompen nunca)

1. `0 ≤ participantCount ≤ capacity` y `participantCount` = cantidad de `planParticipants` con `status: 'active'`.
2. Inscripción y baja modifican **contador y registro en la misma transacción**. Nunca "consultar y después insertar".
3. `PATCH` de `capacity` por debajo de `participantCount` → 409.
4. Un check-in implica una inscripción activa y suma +1 a `reputation` del participante, **en la misma transacción**.
5. Al pasar un plan a `closed` o `completed`, toda inscripción activa sin check-in queda con `noShow: true` y `noShowAt`, en la misma operación.
6. Identidad (`creatorId`, `senderId`, `userId`, `reporterId`) siempre desde el token.

## Transacciones

El replica set es obligatorio: sin él, MongoDB no admite transacciones multidocumento. En desarrollo y tests se usa un replica set de **un nodo** (docker-compose / `MongoMemoryReplSet`) para que el código sea el mismo.

Patrón de inscripción:

```js
// planRepo.incrementIfCapacity — condición y escritura en una sola operación atómica
Plan.findOneAndUpdate(
  { _id: planId, status: 'open', $expr: { $lt: ['$participantCount', '$capacity'] } },
  { $inc: { participantCount: 1 } },
  { new: true, session }
)
```

Si devuelve `null`, se averigua el motivo (no existe → 404, cerrado → `PLAN_CLOSED`, lleno → `PLAN_FULL`). Luego se activa la participación en la misma sesión; si ya estaba activa, el índice único dispara E11000 → `ALREADY_JOINED` y la transacción revierte el `$inc`.

## Transiciones de estado del plan

```
open ──▶ closed ──▶ completed
  │                    ▲
  └──▶ cancelled       │ (cierre automático tras el evento: pendiente)
```

Quién y cuándo dispara cada transición está en [pendientes](../pendientes.md#estados-del-plan).

## Validadores `$jsonSchema` (defensa en profundidad)

Además de Zod y Mongoose, las migraciones agregan validadores en MongoDB para los invariantes críticos (`capacity ≥ 1`, `participantCount ≥ 0`, enums de `status` y `role`) con `validationLevel: 'moderate'`. Así ni un script manual puede dejar datos inválidos.
