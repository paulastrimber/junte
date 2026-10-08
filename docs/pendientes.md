# Pendientes y decisiones abiertas

Lo que el informe no define (o define a medias) y hay que acordar **antes** de implementar la tarea que lo necesita. Cada punto tiene una propuesta para destrabar rápido. Cuando se decide: se marca ✅, se anota la decisión y, si es de arquitectura, se escribe un ADR.

## A. Cambios a llevar al informe

Correcciones de la revisión que **ya están aplicadas en docs/** y faltan en el PDF:

| # | Cambio | Sección del informe | Dónde quedó en docs |
|---|--------|--------------------|--------------------|
| 1 | `role` (`user`\|`admin`) y `status` (`active`\|`suspended`) en `users` | 4.1, 5.2 | [ADR-0004](arquitectura/adr/0004-rol-y-estado-de-usuario.md), [07](arquitectura/07-modelo-de-datos.md) |
| 2 | IP real con `set_real_ip_from` + `X-Forwarded-For` para el rate limiting | 1.1, 5.2 | [02](arquitectura/02-comunicacion-y-red.md#ip-real-del-cliente-x-forwarded-for), [04](arquitectura/04-front-service.md) |
| 3 | `POST /devices` y `DELETE /devices/:token` | 3.2 | [06](arquitectura/06-api.md#usuario-y-dispositivos) |
| 4 | Socket.io solo WebSocket, sin stickiness | 3.2, 7.2 | [ADR-0003](arquitectura/adr/0003-socketio-solo-websocket.md) |
| 5 | Idle timeout de ambos ALB en 300 s | 7.2 | [02](arquitectura/02-comunicacion-y-red.md#timeouts-de-conexiones-largas), [10](arquitectura/10-despliegue.md) |
| 6 | Un NAT Gateway por zona | 7.1 | [ADR-0005](arquitectura/adr/0005-nat-por-zona.md) |
| 7 | Coordenadas del ejemplo en Montevideo `[-56.16, -34.90]` | 3.3 | [06](arquitectura/06-api.md#ejemplo-crear-un-plan) |
| 8 | Seis capas con nombres fijos (Cliente, Entrada pública, Borde, Distribución interna, Aplicación, Datos) en la tabla inicial y en los títulos | Tabla de requisitos, 1.1 | [01](arquitectura/01-vista-general.md#las-seis-capas-nombres-fijos) |
| 9 | Organización del back por módulos (mismas capas) | 6 | [ADR-0001](arquitectura/adr/0001-organizacion-por-modulos.md) |
| 10 | `resolver` de la VPC en Nginx para el DNS del ALB interno | 7.2 paso 5 | [04](arquitectura/04-front-service.md#configuración-clave) |

## B. Decisiones abiertas

### Intereses del plan
**Problema:** el feed usa Jaccard entre intereses del usuario y del plan, pero `plans` no tiene `interests`.
**Propuesta:** agregar `interests: string[]` (máx. 5, de una lista cerrada compartida con el registro) a `plans` y a `POST /plans`.
**Bloquea:** S3 (feed).

### Compatibilidad horaria
**Problema:** `H(u, p)` necesita el calendario del usuario, que vive en el teléfono. El back no puede leerlo y `GET /plans` no recibe nada al respecto.
**Opciones:** (a) la app manda franjas ocupadas anonimizadas (`busy=inicio/fin,…`) en el query o en un `POST /feed`; (b) el back calcula con `H = 0.5` y la app reordena localmente; (c) la app sube sus franjas ocupadas al perfil.
**Propuesta:** (a) con `POST /feed` (body, no query, para no dejar franjas en logs de acceso), sin persistir. Mantiene el score en el back.
**Bloquea:** S3.

### Paginación del feed
**Problema:** con `near` el orden es por score, no por un campo indexado; un cursor tipo `{ createdAt, _id }` no sirve.
**Propuesta:** `$geoNear` trae hasta 200 candidatos dentro de `radiusKm` (devuelve la distancia, necesaria para `P(d)`), se rankean, y el cursor opaco codifica la posición en ese ranking. Límite aceptado: si aparece un plan nuevo entre páginas, puede no verse hasta refrescar.
**Bloquea:** S3.

### Parámetros del check-in
**Problema:** radio, precisión GPS aceptable, ventana horaria y vida del QR están "pendientes de acordar". Tampoco se define si `checkInOpensAt/ClosesAt/RadiusMeters` los carga el creador.
**Propuesta:** el creador puede enviarlos en `POST/PATCH /plans`; defaults: ventana `startsAt − 15 min` a `startsAt + 60 min`, radio 150 m, precisión máx. 100 m, QR válido 90 s (la pantalla del creador lo regenera).
**Bloquea:** S4.

### Estados del plan
**Problema:** no está definido quién ni cuándo pasa un plan a `closed`, `completed` o `cancelled`, ni qué pasa con los inscriptos.
**Propuesta:** el creador cierra inscripciones (`PATCH status: 'closed'`) o cancela (`'cancelled'`, notifica a inscriptos); un job marca `completed` al terminar la ventana de check-in y aplica `noShow`. Bajas no permitidas (409 `PLAN_CLOSED`) después de `startsAt`.
**Bloquea:** S4.

### Reactivación de inscripciones
**Problema:** "un registro por par, reactivable si las reglas lo permiten": ¿cuáles reglas?
**Propuesta:** se puede volver a inscribir si el plan está `open`, hay cupo y no empezó.
**Bloquea:** S4.

### Sesiones múltiples
**Problema:** con un único `refreshTokenHash` por usuario, iniciar sesión en otro dispositivo cierra la sesión del primero.
**Opciones:** aceptarlo (alcance académico) o una colección `sessions` (un hash por dispositivo).
**Propuesta:** aceptarlo y documentarlo; `POST /auth/logout` para revocar explícitamente.
**Bloquea:** S2.

### Perfil completo
**Problema:** `POST /plans` devuelve 409 si "falta completar el perfil", sin definir "completo". Y `GET /users/me` responde 404 "si aún no existe", pero el registro ya crea el usuario.
**Propuesta:** completo = `name`, `university` y ≥ 1 interés. Quitar el 404 de `GET /users/me` (o reservarlo para un usuario borrado).
**Bloquea:** S2–S3.

### Visibilidad de planes
**Problema:** `GET /plans/:id` devuelve 404 "si no es visible", sin regla.
**Propuesta:** visibles = `open`/`closed` futuros + los del propio usuario (creados o inscripto) en cualquier estado. `cancelled` solo para creador e inscriptos.
**Bloquea:** S3.

### Jobs programados
**Problema:** recordatorios y cierre automático requieren tareas periódicas, y con dos instancias correrían duplicadas.
**Propuesta:** scheduler dentro del back con lock en Redis (`SET NX PX`); campo `reminderSentAt` en `plans` (por migración) para no repetir avisos; recordatorio 60 min antes.
**Bloquea:** S4–S5.

### Aviso de cupo liberado
**Problema:** ¿a quién se avisa? No hay lista de espera.
**Propuesta:** al creador (información) o posponer hasta tener lista de espera. No inventar una lista de espera sin acordarlo.
**Bloquea:** S5.

### Notas de voz y contactos
**Problema:** el sprint 5 los menciona, pero no hay modelo (`messages` solo tiene `text`) ni endpoints.
**Propuesta:** notas de voz = `messages.type: 'text'|'voice'` + `audioKey` en S3 por el mismo flujo de `uploads/presign`; contactos = solo invitar compartiendo un link del plan (sin subir contactos al back).
**Bloquea:** S5.

### Endpoints y métricas de administración
**Problema:** `/admin` existe pero sus operaciones no.
**Propuesta:** los marcados ❓ en [06-api.md](arquitectura/06-api.md#administración-requiere-role-admin). Métricas mínimas: planes creados, inscripciones, check-ins, reportes pendientes.
**Bloquea:** S6.

### Redis
**Problema:** "servicio Redis" sin definir: ElastiCache o EC2 propia, y con qué disponibilidad.
**Propuesta:** ElastiCache (Redis/Valkey) con réplica en la otra AZ. Si Redis cae, el chat sigue por polling REST.
**Bloquea:** S1 (infra).

### TLS interno
**Problema:** tramos internos en HTTP. El informe lo reconoce.
**Propuesta:** límite documentado para la entrega; TLS en MongoDB primero si hay tiempo.
**Bloquea:** nada (deuda aceptada).

### Pesos del feed
**Problema:** los pesos del score (0.5 / 0.3 / 0.2) tienen que ser configurables, pero no está definido cómo.
**Propuesta:** variable opcional `FEED_WEIGHTS` en JSON (`{"interests":0.5,"distance":0.3,"schedule":0.2}`), validada con Zod (suma 1); si falta, se usan los valores del informe.
**Bloquea:** S3 (feed). En S1 la variable existe en `.env.example` pero es opcional.

## C. Notas del sprint 1

Lo que apareció al implementar el sprint 1 y queda para revisar con el equipo.

### Base (líder)
- **ESLint 9, no 10:** `neostandard@0.13` declara `peerDependencies: eslint ^9` y `eslint-plugin-import@2.32` no soporta ESLint 10. Se fija `eslint@^9.39`.
- **Node ≥ 22.12:** lo exige `vitest@5`. Se fija en `engines` y en `.nvmrc`.
- **`migrate:check` usa siempre un `MongoMemoryReplSet` efímero:** `down` borra colecciones, así que nunca se corre contra la base de desarrollo.

### back-core (Agente A)

### back-data (Agente B)
- **Hash de contraseñas en seeds:** no hay bcrypt/argon2 instalado, así que los usuarios sembrados tienen `passwordHash: '!seed-no-login'` (no es un hash válido: no pueden iniciar sesión). Cuando auth (S2) elija la librería, el seed debería hashear una contraseña de desarrollo leída de una variable (`SEED_PASSWORD`), nunca fija en el código. Además el login debe tratar un hash con formato inválido como credenciales incorrectas (401), no como 500.
- **Lista de intereses:** los seeds usan valores de ejemplo (`futbol`, `running`, `estudio`, `musica`, `cine`, `juegos-de-mesa`) hasta que se defina la lista cerrada ([Intereses del plan](#intereses-del-plan)).
- **Parámetros del check-in en seeds:** los planes sembrados no tienen `checkInOpensAt/ClosesAt/RadiusMeters` (dependen de [Parámetros del check-in](#parámetros-del-check-in)); agregarlos en S4.
- **`down` conserva colecciones y datos:** las migraciones iniciales crean la colección con su validador; `down` quita índices y validador pero no borra la colección (borrar datos sería irreversible). `migrate:check` verifica que después de `down` no quede ningún índice salvo `_id_`.
- **Validadores más estrictos que 07 (a confirmar):** `users.email` sin mayúsculas ni espacios (garantiza la normalización de la que depende el índice único) y `checkIns` con `additionalProperties: false` (impide guardar la ubicación del participante; el modelo usa `strict: 'throw'`). `participantCount ≤ capacity` se valida con `$expr` junto al `$jsonSchema`. Todos con `validationLevel: 'moderate'`.
- **Backfill de `role`/`status` (ADR-0004):** no se escribió migración de backfill porque no hay entornos con usuarios previos; la colección nace con el validador que exige ambos campos. Si aparece una base vieja, agregar la migración de backfill de [migraciones.md](practicas/migraciones.md).
- **Mongoose 9 depreca `{ new: true }`** en `findOneAndUpdate`: el ejemplo de 07 (patrón de inscripción) debería usar `{ returnDocument: 'after' }`.
- **Idempotencia del chat (`clientId`):** [testing.md](practicas/testing.md) pide que reintentar `chat:send` con el mismo `clientId` cree un solo mensaje, pero `messages` no tiene `clientId` ni índice en 07. Definir antes de S5 (campo + índice único parcial `{ senderId, clientId }` por migración).
- **Helpers para otros agentes:** `tests/helpers/db.js` (`useTestDb()` / `startDb` / `clearDb` / `stopDb`) y `tests/helpers/factories.js` (`makeUser`, `makePlan`, `makeParticipation`). `src/adapters/db/index.js` exporta además `getConnection()`; `src/adapters/db/migrations.js` expone `runMigrations`/`rollbackMigrations`/`migrationStatus` (no se llaman al arrancar la app).

### infra local + Nginx (Agente C)

### mobile (Agente D)
