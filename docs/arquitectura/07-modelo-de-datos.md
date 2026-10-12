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
| `sessions` | `{ sid: 1 }` único | Una sesión por `sid` (lo usa la rotación del refresh) |
| `sessions` | `{ userId: 1 }` | Contar, listar y cerrar las sesiones de un usuario |
| `sessions` | `{ expiresAt: 1 }` TTL (`expireAfterSeconds: 0`) | MongoDB borra las sesiones vencidas |
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
4. Un check-in implica una inscripción activa y suma +1 a `reputation` del participante, **en la misma transacción**.
5. Al pasar un plan a `closed` o `completed`, toda inscripción activa sin check-in queda con `noShow: true` y `noShowAt`, en la misma operación.
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
    $expr: { $or: [{ $lte: ['$capacity', null] }, { $lt: ['$participantCount', '$capacity'] }] }
  },
  { $inc: { participantCount: 1 } },
  { new: true, session }
)
```

Es la misma condición que usa el filtro `availability=available` de los listados (`plan.repository.js`).

Si devuelve `null`, se averigua el motivo (no existe → 404, cerrado → `PLAN_CLOSED`, lleno → `PLAN_FULL`). Luego se activa la participación en la misma sesión; si ya estaba activa, el índice único dispara E11000 → `ALREADY_JOINED` y la transacción revierte el `$inc`.

## Transiciones de estado del plan

```
open ──▶ closed ──▶ completed
  │                    ▲
  └──▶ cancelled       │ (cierre automático tras el evento: pendiente)
```

Quién y cuándo dispara cada transición está en [pendientes](../pendientes.md#estados-del-plan).

## Validadores `$jsonSchema` (defensa en profundidad)

Además de Zod y Mongoose, las migraciones agregan validadores en MongoDB para los invariantes críticos (en `plans`: `capacity` de 1 a 500 o `null`, `participantCount ≥ 0` y `≤ capacity` cuando hay cupo, `endsAt` posterior a `startsAt` y hasta 7 días después, `price` entero de 0 a 100000, `interests` de 1 a 10 keys, `title` de 3 a 100 y `location.label` obligatorio; además, enums de `status` y `role`, `users.birthDate` de tipo fecha, `university`/`career`/`city`/`neighborhood`/`interests` con forma de key, `interests` con máximo 10, campos obligatorios de `sessions` y de cada catálogo, `minAge` entero de 16 a 99) con `validationLevel: 'moderate'`. Así ni un script manual puede dejar datos inválidos.
