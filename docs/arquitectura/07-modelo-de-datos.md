# 07 · Modelo de datos (MongoDB)

Catorce colecciones: las de la app y seis catálogos. Todas con `_id: ObjectId`, `createdAt` y `updatedAt` (`timestamps: true` en Mongoose). Referencias por `ObjectId`, controladas por la aplicación. Fechas como `Date`.

**Los índices y validadores se crean solo por migraciones** ([migraciones.md](../practicas/migraciones.md)); Mongoose corre con `autoIndex: false` y `autoCreate: false`.

## Colecciones

### `users`

| Campo | Tipo | Notas |
|-------|------|-------|
| `email` | string | Único, normalizado (trim + minúsculas) |
| `passwordHash` | string | Argon2id. Nunca se serializa |
| `name` | string | 1–80 |
| `birthDate` | Date? | Día del calendario guardado a medianoche UTC. La edad **no se guarda**: el serializer la calcula (`age`). Solo se le muestra al dueño |
| `university` | string? | **Key** de `universities` o `other` ("Otra"). Opcional ("si corresponde": no todo usuario estudia) |
| `career` | string? | **Key** de `careers` de esa universidad o `other`. Se quita sola si cambia la universidad |
| `city`, `neighborhood` | string? | **Keys** de `cities` y `neighborhoods` (el barrio, de esa ciudad) o `other`. Datos del perfil, no ubicación en tiempo real; no se exponen a otros usuarios ni se loguean |
| `interests` | string[] | **Keys** de `interests`, máx. 10. Se usa en Jaccard del feed |
| `onboardingCompletedAt` | Date? | Cuándo terminó o dejó para después el onboarding. Sin valor = el onboarding sigue pendiente |
| `role` | `'user'` \| `'admin'` | **➕ revisión.** Default `user`. Solo cambia por migración/seed o por otro admin. Ver [ADR-0004](adr/0004-rol-y-estado-de-usuario.md) |
| `status` | `'active'` \| `'suspended'` | **➕ revisión.** El middleware JWT exige `active` (el informe pide verificar "estado del usuario" pero no definía el campo) |
| `reputation` | number | Default 0. Solo la escribe el back |
| `photoKey` | string? | Clave del objeto en S3, no la imagen |

Perfil completo = `name` + `birthDate` + al menos 1 interés (regla `isProfileComplete` del servicio de usuarios).
`refreshTokenHash` ya **no existe** en `users`: se reemplazó por la colección `sessions` ([ADR-0008](adr/0008-sesiones-multiples.md)).

### Catálogos

Seis colecciones de datos de referencia, **editables por el admin** (S6) y cargadas con datos iniciales por migración ([ADR-0009](adr/0009-catalogos-en-la-base.md)). Todas tienen `key` (inmutable, kebab-case), `name` (editable), `order` y `active` (se desactiva en lugar de borrar: quien ya eligió esa opción la conserva). Los usuarios guardan la `key`.

| Colección | Campos propios | Datos iniciales |
|-----------|----------------|-----------------|
| `interestCategories` | — | 8 categorías (Deportes, Salidas y gastronomía, Música, Arte y cultura, Entretenimiento, Aire libre, Estudio y carrera, Comunidad) |
| `interests` | `categoryKey`, `minAge?` (16–99) | 57 opciones; "Bares y cervecerías" y "Salir a bailar" con `minAge: 18` |
| `universities` | `shortName` | UM, ORT, UCU, Udelar, UDE, UCLAEH, UTEC |
| `careers` | `universityKey`, `group?` (facultad) | 250 carreras **de grado** de esas siete universidades, relevadas en sus sitios oficiales (UM 26, ORT 30, UCU 53, Udelar 102, UDE 21, UCLAEH 6, UTEC 12) |
| `cities` | `department` | Montevideo |
| `neighborhoods` | `cityKey`, `ineCode?` | Los 62 barrios de Montevideo (áreas del INE) |

- **"Otra"** no es una fila: es la key reservada `other`, válida en `university`, `career`, `city` y `neighborhood`. Sin texto libre.
- Los datos iniciales viven en `back-service/catalogs/` (fuentes y criterios en los comentarios de cada archivo). `syncCatalogs` **solo inserta** lo que falta: nunca pisa lo que el admin editó. Lo corre la migración `seed-catalogs` (así queda cargado en todo entorno, producción incluida) y `npm run catalogs:sync` (`task db:catalogs:sync`) para sumar entradas nuevas a una base existente.
- Criterio de las carreras: solo grado. Quedan afuera tecnicaturas, tecnólogos, ciclos iniciales, cursos, diplomas, posgrados y carreras de menos de 3 años.
- El back lee los catálogos completos (unas 400 filas) y los cachea 60 s por instancia.

### `sessions`

Una por login/dispositivo.

| Campo | Tipo | Notas |
|-------|------|-------|
| `userId` | ObjectId → users | |
| `sid` | string | Identificador público de la sesión (va dentro de los tokens). Único |
| `refreshTokenHash` | string | sha256 (hex) del refresh token **vigente** de esa sesión. Nunca el token |
| `deviceLabel` | string? | "android", "ios"… (máx. 60). Solo para listar sesiones |
| `lastUsedAt` | Date | Último login o refresh |
| `expiresAt` | Date | Vencimiento del refresh vigente (30 días desde el último uso). El índice TTL borra el documento al llegar |
| `revokedAt` | Date? | Sin valor mientras está activa. Se conserva (hasta el TTL) para detectar el reuso de un refresh viejo |

Reglas: máximo 5 sesiones activas (`revokedAt` vacío y `expiresAt` futuro) por usuario; al abrir otra se revoca la más antigua por `createdAt`. La rotación es una actualización condicional sobre `{ sid, userId, refreshTokenHash, revokedAt: null, expiresAt > ahora }`.

### `passwordResets`

**➕ 2026-11-15.** Recuperación de contraseña: un documento por usuario (pedir otro código reemplaza al anterior). Migración `20261115120000-create-password-resets`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `userId` | ObjectId → users | Único |
| `codeHash` | string | HMAC-SHA256 (hex) del código de 6 dígitos, con una clave derivada del secreto del back y con el usuario adentro. **Nunca el código**: con un millón de combinaciones, un hash simple se revertiría en segundos |
| `expiresAt` | Date | Hasta cuándo vale el código (15 minutos). Se comprueba en cada consulta |
| `attempts` | number | Intentos hechos con el código vigente (máx. 5). Se suma **antes** de comparar, en una operación condicional |
| `requestCount` | number | Códigos pedidos en la ventana (máx. 5 por hora) |
| `lastSentAt` | Date | Último envío (uno por minuto) |
| `windowEndsAt` | Date | Fin de la ventana de pedidos. El índice TTL borra el documento al llegar |

Usar el código borra el documento dentro de la misma transacción que cambia `users.passwordHash` y revoca las sesiones: un código nunca sirve dos veces.

### `plans`

| Campo | Tipo | Notas |
|-------|------|-------|
| `title` | string | 3–100 |
| `description` | string? | Hasta 2000 |
| `startsAt` | Date | En el futuro al crear |
| `endsAt` | Date | **➕ S3.** Obligatorio, lo ingresa el creador. Posterior a `startsAt` y como máximo 7 días después. Se usa en la compatibilidad horaria del feed, en la visibilidad y en el detalle |
| `location` | `{ label, type: 'Point', coordinates: [lng, lat] }` | Índice `2dsphere`. `label` obligatorio (1–120) |
| `interests` | string[] | **➕ S3.** De 1 a 10 **keys** del catálogo `interests` (el mismo del perfil). Se usa en el Jaccard y en el filtro del feed |
| `university` | string? | Derivada del perfil del creador al crear el plan (puede faltar: la universidad del perfil es opcional) |
| `capacity` | int 1–500 \| `null` | **`null` = cupo ilimitado** (un plan sin límite nunca está lleno). El campo siempre está presente |
| `price` | int 0–100000 | **➕ S3.** Costo por persona en pesos uruguayos. 0 = gratis |
| `participantCount` | int ≥ 0, ≤ `capacity` si hay cupo | Solo el back, en transacción |
| `creatorId` | ObjectId → users | Del token |
| `status` | `open` \| `closed` \| `cancelled` \| `completed` | Transiciones: ver abajo |
| `photoKey` | string? | |
| `checkInOpensAt`, `checkInClosesAt` | Date | **➕ S4.** Ventana de asistencia. Solo el back: `startsAt − 15 min` a `min(startsAt + 60 min, endsAt)`. Se recalcula en la misma operación que cambia las fechas |
| `checkInRadiusMeters` | int 50–1000 | **➕ S4.** Lo elige el creador; 150 por defecto |
| `qrNonceHash`, `qrExpiresAt` | string?, Date? | Desafío QR vigente (hash SHA-256 del nonce, nunca el nonce) |
| `qrPreviousNonceHash`, `qrPreviousExpiresAt` | string?, Date? | **➕ S4.** Desafío anterior: al renovar el QR sigue valiendo 10 segundos (y nunca más allá de su propio vencimiento). Se escriben en la misma operación que guarda el nuevo |
| `reminderSentAt` | Date? | **➕ S5.** Cuándo el job mandó el recordatorio push (una sola vez por plan, actualización condicional). Cambiar `startsAt` lo borra. Migración `20261104120100-plans-reminder-sent-at` (solo validador) |
| `attendanceClosedAt` | Date? | **➕ S4.** Cuándo el job cerró la asistencia (marcó `noShow` y resolvió el +1 del creador). Sin valor = pendiente. Se escribe una sola vez |

Los parámetros de la asistencia (15 y 60 minutos, radio 50/150/1000 m, precisión máxima de 100 m, QR de 90 s con 10 s de margen para el anterior, y los 2 asistentes que necesita el creador) se definen en un único lugar: `back-service/src/shared/attendance.js`.

### `planParticipants`

`planId`, `userId`, `status` (`active` \| `cancelled`), `joinedAt`, `cancelledAt?`, `noShow` (default `false`), `noShowAt?`.
Un **único registro por par** plan–usuario; una baja lo pasa a `cancelled` (con `cancelledAt`) y una nueva inscripción lo reactiva: vuelve a `active`, con `joinedAt` nuevo y sin `cancelledAt`. Las reglas son las mismas que para la primera inscripción (plan `open`, con lugar y sin empezar).
`noShow` y `noShowAt` los escribe solo el job de cierre de asistencia.

### `checkIns`

`planId`, `userId`, `checkedInAt` (hora del servidor), `method` (`'qr-location'` \| `'location'`), `distanceMeters`, `accuracyMeters`.
`'location'` es el check-in del creador inscripto, que muestra el QR y no puede escanearlo (**➕ S4**).
**No se persiste la latitud/longitud del participante** (el validador de la colección no admite otros campos).

### `messages`

`planId`, `senderId` (del token), `type` (`text`; **➕ S5**, sin `type` cuenta como texto), `text` (1–2000, recortado), `status` (`visible` \| `hidden`), `clientId?`, `createdAt` (hora del servidor).
**➕ S5 (notas de voz):** `type: 'voice'` + `audioKey` (clave S3 `messages/<planId>/<userId>/<uuid>.m4a`) + `durationMs` (1–60000), sin `text`; los de texto siguen exigiendo `text` y no llevan audio (validador `oneOf`, migración `20261104120200-messages-voice`).
`clientId` (**➕ S5**): clave de idempotencia que genera el teléfono (1–64 caracteres `[A-Za-z0-9_-]`, opcional). Con el índice único parcial `{ senderId, clientId }`, un reintento del mismo mensaje (por Socket.io o por REST) devuelve el que ya existía en lugar de crear otro.

### `reports`

`reporterId` (del token), `targetType` (`user` \| `plan` \| `message`), `targetId`, `reason`, `description`, `status` (`pending` \| `reviewed` \| `dismissed`), `createdAt`.

**➕ S6:** `reason` es uno de los motivos fijos `spam` \| `harassment` \| `inappropriate` \| `scam` \| `other`; `description` (opcional, obligatoria con `other`) tiene de 1 a 500 caracteres; `resolvedBy` (el admin) y `resolvedAt` se completan al resolverlo. Índice único **parcial** `{ reporterId, targetType, targetId }` solo para los `pending`: la misma persona no puede tener dos reportes pendientes sobre lo mismo (reportar otra vez devuelve el que existía); una vez resuelto, puede volver a reportarlo. Migración `20261014130000-reports-reasons-and-resolution` (sin backfill: no había reportes).

### `spotAlerts`

**➕ S5.** `planId`, `userId` (del token), `createdAt`, `updatedAt`. Un pedido de "avisame si se libera un lugar" por persona y plan (índice único). Se borra al inscribirse, al cancelarlo, o por el job `purge-spot-alerts` cuando el plan empezó, se canceló o ya no existe. Migración `20261104120000-create-spot-alerts`.

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
| `messages` | `{ senderId: 1, clientId: 1 }` único, parcial (`clientId` string) | Un reintento de envío no duplica el mensaje (**➕ S5**) |
| `reports` | `{ status: 1, createdAt: 1 }` | Cola de moderación |
| `reports` | `{ reporterId: 1, targetType: 1, targetId: 1 }` único, parcial (`status: 'pending'`) | Un solo reporte pendiente por persona y objetivo (**➕ S6**) |
| `spotAlerts` | `{ planId: 1, userId: 1 }` único | Un pedido de aviso por persona y plan; buscar los de un plan (**➕ S5**) |
| `deviceTokens` | `{ token: 1 }` único | Un registro por dispositivo |
| `deviceTokens` | `{ userId: 1 }` | Enviar push a un usuario |
| `sessions` | `{ sid: 1 }` único | Una sesión por `sid` (lo usa la rotación del refresh) |
| `sessions` | `{ userId: 1 }` | Contar, listar y cerrar las sesiones de un usuario |
| `sessions` | `{ expiresAt: 1 }` TTL (`expireAfterSeconds: 0`) | MongoDB borra las sesiones vencidas |
| `passwordResets` | `{ userId: 1 }` único | Un pedido de recuperación por usuario (**➕ 2026-11-15**) |
| `passwordResets` | `{ windowEndsAt: 1 }` TTL (`expireAfterSeconds: 0`) | MongoDB borra el pedido al terminar la ventana |
| `interestCategories`, `universities`, `cities` | `{ key: 1 }` único | Una fila por key |
| `interests` | `{ key: 1 }` único; `{ categoryKey: 1, order: 1 }` | Una fila por key; listar por categoría |
| `careers` | `{ universityKey: 1, key: 1 }` único | La key es única dentro de cada universidad |
| `neighborhoods` | `{ cityKey: 1, key: 1 }` único | La key es única dentro de cada ciudad |

Los índices que no figuran en el informe (`creatorId`, `userId+status`, `deviceTokens.userId`, los de `sessions`) se agregan porque las consultas de esas pantallas los necesitan; cualquier índice nuevo entra por migración con su justificación.

**S3 no agregó índices.** El feed usa `location_2dsphere` (`$geoNear` filtra por distancia y después por estado, fecha y filtros) y el listado cronológico usa `status_startsAt`. Los filtros por `interests`, `price` o cupo se aplican sobre ese conjunto ya acotado; si el volumen crece, medir antes de sumar índices. Las migraciones de S3 son de datos y validador: `plans-backfill-ends-at` (planes anteriores: `endsAt = startsAt + 2 h`), `plans-backfill-price` (`price: 0`) y `plans-validator-ends-at-and-limits`.

## Invariantes (no se rompen nunca)

1. `0 ≤ participantCount ≤ capacity` (con cupo ilimitado, `capacity: null`, solo aplica el `≥ 0`) y `participantCount` = cantidad de `planParticipants` con `status: 'active'`. "Lleno" **se calcula** (`capacity !== null && participantCount >= capacity`): no es un `status` ni un campo guardado.
2. Inscripción y baja modifican **contador y registro en la misma transacción**. Nunca "consultar y después insertar".
3. `PATCH` de `capacity` por debajo de `participantCount` → 409 (condición y escritura en una sola operación). Pasar a `null` (ilimitado) siempre es válido.
4. Un check-in implica una inscripción activa y suma +1 a `reputation` del participante, **en la misma transacción**. Excepción: el check-in del creador inscripto (`method: 'location'`) no suma en ese momento; recibe el +1 al cerrar la asistencia, solo si al menos 2 participantes más hicieron check-in.
5. Al cerrar la ventana de check-in, el job de cierre de asistencia marca `noShow: true` y `noShowAt` en toda inscripción activa sin check-in y fija `attendanceClosedAt` en el plan, **en una transacción y una sola vez por plan**. `noShow` no resta reputación. Pasar un plan a `closed` no marca nada y los planes `cancelled` no se procesan.
6. Identidad (`creatorId`, `senderId`, `userId`, `reporterId`) siempre desde el token.

## Transacciones

El replica set es obligatorio: sin él, MongoDB no admite transacciones multidocumento. En desarrollo y tests se usa un replica set de **un nodo** (docker-compose / `MongoMemoryReplSet`) para que el código sea el mismo.

Patrón de inscripción (S4):

```js
// planRepo.incrementIfCapacity — condición y escritura en una sola operación atómica.
// Con cupo ilimitado (capacity: null) siempre hay lugar: `$lt` contra null sería false, por eso el `$or`.
Plan.findOneAndUpdate(
  {
    _id: planId,
    status: 'open',
    startsAt: { $gt: now },           // un plan que ya empezó no admite inscripciones
    $expr: { $or: [{ $lte: ['$capacity', null] }, { $lt: ['$participantCount', '$capacity'] }] }
  },
  { $inc: { participantCount: 1 } },
  { returnDocument: 'after', session }
)
```

Es la misma condición que usa el filtro `availability=available` de los listados (`plan.repository.js`).

Si devuelve `null`, se averigua el motivo (no existe → 404, cerrado o ya empezado → `PLAN_CLOSED`, lleno → `PLAN_FULL`). Luego se activa la participación en la misma sesión; si ya estaba activa, el índice único dispara E11000 → `ALREADY_JOINED` y la transacción revierte el `$inc`.

Las demás operaciones de S4 siguen el mismo criterio (condición y escritura juntas, todo en una transacción):

- **Baja:** se cancela la inscripción activa y se resta 1 al contador (`participantCount > 0`, plan `open` o `closed` y sin empezar). Si el plan ya no admite bajas o la persona ya hizo check-in, la transacción revierte la cancelación.
- **Check-in:** dentro de la transacción se vuelve a comprobar (y se toca) la inscripción activa, así una baja simultánea entra en conflicto en lugar de colarse; después se inserta el `checkIn` y se suma la reputación.
- **Cierre de asistencia:** `attendanceClosedAt` se fija con una actualización condicional (`attendanceClosedAt` vacío, plan `open` o `closed`, ventana cerrada). Solo quien logra esa escritura marca los `noShow` y premia al creador: dos instancias a la vez no lo hacen dos veces.

## Transiciones de estado del plan

```
open ◀──▶ closed ──▶ completed      (job, al llegar endsAt; también desde open)
  │          │
  └────┬─────┘
       ▼
   cancelled                        (creador, hasta endsAt)
```

- El creador (`PATCH /plans/:id { status }`): `open ↔ closed` antes de `startsAt`; `open | closed → cancelled` hasta `endsAt`. Cada cambio es una actualización condicional sobre el estado de origen.
- El back: `open | closed → completed` cuando llega `endsAt` (job con lock en Redis). Si el cierre de asistencia no había corrido, se hace en la misma transacción.
- `cancelled` y `completed` son finales. Detalle y reglas en [06-api.md](06-api.md#estado-del-plan).

## Validadores `$jsonSchema` (defensa en profundidad)

Además de Zod y Mongoose, las migraciones agregan validadores en MongoDB para los invariantes críticos (en `plans`: `capacity` de 1 a 500 o `null`, la ventana de check-in obligatoria, ordenada y nunca posterior a `endsAt`, `checkInRadiusMeters` de 50 a 1000, `participantCount ≥ 0` y `≤ capacity` cuando hay cupo, `endsAt` posterior a `startsAt` y hasta 7 días después, `price` entero de 0 a 100000, `interests` de 1 a 10 keys, `title` de 3 a 100 y `location.label` obligatorio; además, enums de `status` y `role`, `checkIns.method` (`qr-location` o `location`) sin campos adicionales, `users.birthDate` de tipo fecha, `university`/`career`/`city`/`neighborhood`/`interests` con forma de key, `interests` con máximo 10, campos obligatorios de `sessions` y de cada catálogo, `minAge` entero de 16 a 99) con `validationLevel: 'moderate'`. Así ni un script manual puede dejar datos inválidos.
