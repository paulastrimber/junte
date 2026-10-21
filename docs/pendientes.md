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
✅ **Decidido (2026-10-12, Paula) e implementado en S3:** `plans.interests` son de 1 a 10 keys del catálogo `interests` (el mismo del perfil), obligatorios en `POST /plans`. Se validan contra el catálogo (existen, están activos, edad mínima contra la edad **del creador**); al editar, el plan conserva los que ya tenía aunque se hayan desactivado. Se usan en el Jaccard y en el filtro "tipo de actividad" del feed.

### Compatibilidad horaria
✅ **Decidido (2026-10-12, Paula) e implementado en S3 ([ADR-0010](arquitectura/adr/0010-feed-por-ranking.md)):** opción (a), `POST /feed` con las franjas ocupadas en el body, sin persistir.
- La app lee los **próximos 30 días** del calendario (solo si hay permiso), descarta los eventos de día completo y manda hasta **200 franjas** con solo inicio y fin, más el período leído (`calendar.from`/`to`).
- Los planes tienen **`endsAt` obligatorio** (lo ingresa el creador; posterior a `startsAt`, hasta 7 días para permitir campamentos): la superposición se calcula contra `startsAt`–`endsAt`.
- Además de las franjas del calendario, el back cuenta como ocupados **los planes en los que el usuario ya está inscripto**, así funciona aunque no haya permiso de calendario.
- `H = 0` con superposición; `1` sin superposición y con el horario del plan dentro del período leído; `0.5` si no se sabe (sin calendario, o plan fuera del período).
- `GET /plans?near=` sigue existiendo, sin calendario.

### Paginación del feed
✅ **Decidido (2026-10-12, Paula) e implementado en S3 ([ADR-0010](arquitectura/adr/0010-feed-por-ranking.md)):** `$geoNear` trae hasta 200 candidatos dentro de `radiusKm`, se rankean y el cursor opaco guarda la posición en ese ranking, el instante de la primera página y una huella de la consulta. Límite aceptado: un plan nuevo entre páginas no se ve hasta refrescar.

### Radio del feed
✅ **Decidido (2026-10-12, Paula):** `radiusKm` de 0.5 a 50, por defecto 10. En la app, un selector de valores fijos (0.5, 1, 2, 5, 10, 25, 50 km) dentro del panel de filtros.

### Filtros del feed, costo y planes llenos
✅ **Decidido (2026-10-12, Paula) e implementado en S3:**
- **Filtros predefinidos** (la consulta se arma en el back, regla 8): fecha (`from`/`to`), intereses (el plan tiene al menos uno), costo (rangos) y cupo (`availability`). En la app la fecha se elige entre opciones fijas (hoy, 7 días, 30 días).
- **Costo:** campo `price` en el plan (pesos uruguayos, entero, 0 = gratis, hasta 100000). Filtro por **rangos combinables**: gratis ($0), $1–500, $501–1000 y más de $1000. Los límites están en un solo lugar del back (`PRICE_RANGES`, `plans/plan.rules.js`) y la app los recibe por `GET /plans/filters`.
- **Planes llenos:** "lleno" se calcula (`participantCount >= capacity`), no es un `status`. El feed principal muestra los planes con cupo; los llenos van en una sección aparte (`availability=full`), donde se ve el detalle completo pero no hay inscripción.
- **Cupo ilimitado:** `capacity: null`. Nunca está lleno (`isFull: false`, `availableSpots: null`), no aparece entre los llenos. Por `PATCH` se pasa de ilimitado a un número (no menor a los inscriptos → 409) o al revés.

### Parámetros del check-in
**Problema:** radio, precisión GPS aceptable, ventana horaria y vida del QR están "pendientes de acordar". Tampoco se define si `checkInOpensAt/ClosesAt/RadiusMeters` los carga el creador.
✅ **Decidido (2026-10-12, Paula) e implementado en S4** ([s4-decisiones.md](tareas/s4-decisiones.md)): el creador solo elige el **radio** (`checkInRadiusMeters`, 50 a 1000 m, 150 por defecto). La ventana la calcula siempre el back: `startsAt − 15 min` a `startsAt + 60 min`, y nunca después de `endsAt`. Precisión máxima del GPS 100 m; QR válido 90 s (la pantalla del creador lo renueva). Todos los valores están en `back-service/src/shared/attendance.js`.

### Estados del plan
**Problema:** no está definido quién ni cuándo pasa un plan a `closed`, `completed` o `cancelled`, ni qué pasa con los inscriptos.
✅ **Decidido (2026-10-12, Paula) e implementado en S4** ([s4-decisiones.md](tareas/s4-decisiones.md)): el creador cierra o reabre las inscripciones (`PATCH status: 'closed' | 'open'`, antes de `startsAt`) y cancela (`'cancelled'`, hasta `endsAt`). Un job marca `noShow` **al cerrar la ventana de check-in** y pasa el plan a `completed` **al llegar `endsAt`**. `closed` no marca `noShow`. Bajas no permitidas (409 `PLAN_CLOSED`) después de `startsAt` ni con el check-in hecho. El aviso a los inscriptos cuando se cancela un plan queda para S5 (push).

### Reactivación de inscripciones
**Problema:** "un registro por par, reactivable si las reglas lo permiten": ¿cuáles reglas?
✅ **Decidido (2026-10-12, Paula) e implementado en S4:** se puede volver a inscribir si el plan está `open`, hay cupo y no empezó (las mismas reglas que la primera vez). Se reutiliza el mismo registro.

### Sesiones múltiples
✅ **Decidido (2026-10-11, Phillip) e implementado en S2 ([ADR-0008](arquitectura/adr/0008-sesiones-multiples.md)):** un usuario puede tener sesión abierta en varios dispositivos a la vez. Se descarta el único `users.refreshTokenHash`.
**Diseño:** colección `sessions` (una por dispositivo/login): `userId`, `sid`, `refreshTokenHash` (hash del refresh vigente de esa sesión), `deviceLabel?`, `lastUsedAt`, `expiresAt`, `revokedAt?`. Índices por migración: `{ sid: 1 }` único, `{ userId: 1 }` y TTL sobre `expiresAt`. Máximo 5 sesiones activas por usuario (al exceder, se revoca la más antigua).
**Reglas:** el refresh token lleva `sid` y `jti`; la rotación es por sesión y con actualización condicional sobre el hash vigente. Reuso de un refresh viejo → se revoca **solo esa sesión** (401). `POST /auth/logout` cierra la sesión actual; `POST /auth/logout-all` cierra todas. Un usuario `suspended` pierde todas sus sesiones.
**Impacto en docs:** 07 (colección nueva y `users` sin `refreshTokenHash`), 09 (tabla de autenticación), 06 (`logout`/`logout-all`), CLAUDE.md (lista de colecciones). Actualizados en el PR de S2.

### Fecha de nacimiento y ubicación del perfil (nuevo)
✅ **Decidido (2026-10-11, Phillip):** el perfil guarda `birthDate` (no `age`) y la zona donde vive el usuario.
- **`birthDate`:** fecha sin hora (`YYYY-MM-DD`; en Mongo, `Date` a medianoche UTC). Zod: fecha válida, no futura, y edad calculada entre 16 y 100. La edad se **deriva** en el serializer (`age`, solo lectura); `age` en el body se rechaza (`.strict()`).
- **`neighborhood`** (barrio) y **`city`** (localidad): strings opcionales, `trim`, 1–60 caracteres. Texto libre por ahora; una lista cerrada (barrios de Montevideo y localidades) queda para más adelante.
- **Privacidad:** son datos del perfil, no ubicación en tiempo real. No se usan para el feed (el feed usa las coordenadas del plan y la posición que manda la app) y **no se exponen a otros usuarios** hasta definir su visibilidad. No se loguean. `GET /users/me` devuelve `birthDate`, `age`, `neighborhood` y `city` solo al dueño.
- **Abierto:** si se muestran la edad, el barrio o la localidad en el perfil público de un creador o inscripto (S3–S4), y si `neighborhood`/`city` deberían ser obligatorios. Por ahora son opcionales: no cambian la definición de "perfil completo".
**Bloquea:** nada. S2 lo implementa con estos valores.

### Perfil completo
✅ **Decidido (2026-10-11, Phillip):** perfil completo = `name` + `birthDate` + al menos 1 interés. `university`, `neighborhood` y `city` son **opcionales** ("si corresponde": no todo usuario estudia en una universidad).
- `POST /plans` sin perfil completo → 409 `PROFILE_INCOMPLETE`.
- `GET /users/me` ya no documenta 404: el registro crea el usuario y `authenticate` responde 401 si el usuario no existe, así que ese 404 no se puede alcanzar.
- Consecuencia: `plans.university` es "derivada del perfil del creador" y puede ser `null`. Revisar si el feed o el panel admin lo asumen siempre presente.

### Visibilidad de planes
✅ **Decidido (2026-10-12, Paula) e implementado en S3:** visibles para cualquiera los planes `open`/`closed` que todavía no terminaron; los propios (creados o con inscripción activa) en cualquier estado. `cancelled`, `completed` o ya terminados solo los ven su creador y sus inscriptos; para el resto, 404. Los listados (`GET /plans`, `POST /feed`) solo traen planes `open` que todavía no empezaron.

### Jobs programados
**Problema:** recordatorios y cierre automático requieren tareas periódicas, y con dos instancias correrían duplicadas.
✅ **Scheduler implementado en S4** (`back-service/src/jobs/scheduler.js`): corre dentro del back, un ciclo por minuto, con lock en Redis (`SET NX PX`). Jobs actuales: cierre de asistencia y completar planes.
**Queda para S5:** el recordatorio (campo `reminderSentAt` en `plans`, por migración, para no repetir avisos; propuesta: 60 min antes).
**Bloquea:** S5 (recordatorios).

### Aviso de cupo liberado
✅ **Decidido (2026-10-12, Paula):** no hay lista de espera con orden. En un plan **lleno** (`participantCount >= capacity`; "lleno" se calcula, no es un `status`) el usuario puede pedir que le avisen cuando se libere un lugar. Al liberarse un cupo se avisa **a todos** los que lo pidieron y el primero que se inscribe se queda con el lugar (lo garantiza la transacción de cupos de S4).
**Diseño propuesto (a confirmar antes de implementar):** colección `spotAlerts` (`planId`, `userId`, `createdAt`; índice único `{ planId, userId }`), `PUT /plans/:id/spot-alert` y `DELETE /plans/:id/spot-alert` (idempotentes, identidad desde el token) y `spotAlertRequested` en el detalle del plan.
**Pasado completo a S5 (2026-10-12, Paula):** la colección `spotAlerts`, los endpoints, el botón "Avisarme" en la app, los ganchos (al darse de baja un inscripto, después del commit, se dispara el aviso; al inscribirse, se borra el pedido de ese usuario) y el envío por push (FCM). En S4 no se implementó nada de esto: la inscripción y la baja solo dejan el punto donde enganchar el aviso.
**A definir en S5:** qué pasa con los pedidos después de avisar (propuesta: se conservan hasta que el usuario se inscribe, cancela el aviso o el plan empieza).
**Bloquea:** S5.

### Notas de voz y contactos
**Problema:** el sprint 5 los menciona, pero no hay modelo (`messages` solo tiene `text`) ni endpoints.
✅ **Decidido (2026-10-14, @mperez14ang):** se aprueba la propuesta: notas de voz = `messages.type: 'text'|'voice'` + `audioKey` en S3 por el mismo flujo de `uploads/presign`; contactos = solo invitar compartiendo un link del plan (sin subir contactos al back). **Se implementa después del chat de texto, en otro PR** (S5-BE-09 y S5-MOB-05). El chat de texto ya guarda `type: 'text'`, así que sumar `voice` no necesita backfill.
**A definir al implementarlo:** duración y tamaño máximos del audio, formato (AAC/M4A), y si el link para compartir abre la app (deep link) o una página.

### Endpoints y métricas de administración
✅ **Decidido (2026-10-14, Domenico) e implementado en S6:** la propuesta de [06-api.md](arquitectura/06-api.md#administración-requiere-role-admin) (cola de reportes, resolverlos, ocultar mensajes, suspender y reactivar cuentas, métricas y CRUD de catálogos) **más una vista previa de lo reportado** en cada reporte (texto del mensaje, título del plan, nombre y email del usuario), para que el admin decida sin buscarlo a mano. Métricas: totales y últimos 7 días de usuarios, planes, inscripciones, check-ins, mensajes y reportes. Detalle y lo que se resolvió con la opción más chica en [I](#i-notas-del-sprint-6-admin-y-móvil).

### Redis
**Problema:** "servicio Redis" sin definir: ElastiCache o EC2 propia, y con qué disponibilidad.
**Propuesta:** ElastiCache (Redis/Valkey) con réplica en la otra AZ. Si Redis cae, el chat sigue por polling REST.
**Bloquea:** S1 (infra).

✅ **Decidido (2026-10-19): Redis no decide el health check.** `/internal/health` respondía 503 si Redis no contestaba; detrás del ALB interno eso sacaba a todas las instancias del back y tiraba la API entera, en contra de "si Redis cae, el chat sigue por polling". Ahora el código HTTP depende solo de MongoDB (503 si no responde) y Redis se sigue informando en `checks`, con `status: 'degraded'` y 200 cuando está caído. Sin Redis tampoco corren los jobs ([sección G](#g-notas-del-sprint-4-inscripciones-asistencia-y-reputación)): se ponen al día cuando vuelve. Para enterarse de que Redis cayó hay que mirar el cuerpo del health (o una alarma de ElastiCache en S6), no el estado de los destinos del ALB.
**App:** `services/api/health.js` toma como degradado tanto el 503 como un 200 con `status: 'degraded'`, así que la pantalla de diagnóstico también avisa cuando Redis está caído.

**Motor en AWS (2026-10-21):** `30-redis.yml` usa ElastiCache **Redis OSS 7.1** (la última de Redis en ElastiCache; local usa Redis 8). El back solo usa pub/sub y `SET NX PX`, iguales en las dos. **Valkey** (fork abierto de Redis) es compatible y cuesta ~20 % menos por nodo: si el equipo lo prefiere, es cambiar `Engine` y `EngineVersion` en el template.

### TLS interno
**Problema:** tramos internos en HTTP. El informe lo reconoce.
**Propuesta:** límite documentado para la entrega; TLS en MongoDB primero si hay tiempo.
**Bloquea:** nada (deuda aceptada).

### Pesos del feed
✅ **Decidido (2026-10-12, Paula) e implementado en S3:** variable opcional `FEED_WEIGHTS` en JSON (`{"interests":0.5,"distance":0.3,"schedule":0.2}`), validada al arrancar (los tres pesos, entre 0 y 1, que sumen 1; si es inválida el back no arranca). Sin ella se usan los valores del informe.

## C. Notas del sprint 1

Lo que apareció al implementar el sprint 1 y queda para revisar con el equipo.

### Base (líder)
- **ESLint 9, no 10:** `neostandard@0.13` declara `peerDependencies: eslint ^9` y `eslint-plugin-import@2.32` no soporta ESLint 10. Se fija `eslint@^9.39`.
- **Node ≥ 22.12:** lo exige `vitest@5`. Se fija en `engines` y en `.nvmrc`.
- **`migrate:check` usa siempre un `MongoMemoryReplSet` efímero:** nunca se corre contra la base de desarrollo.
- **Tests en paralelo y `mongodb-memory-server`:** varios archivos de test competían por el lockfile de la descarga del binario (`Cannot unlock file …lock`). Se resolvió con `tests/helpers/global-setup.js` (resuelve el binario una vez y lo pasa por `MONGOMS_SYSTEM_BINARY`) y se fijó MongoDB 9.0.2 en `package.json › config.mongodbMemoryServer`, igual que el compose.
- **Script `dev` sin `.env`:** ver la nota del Agente C. `task setup` siempre crea `.env`, así que no se cambió el script; decidir si conviene `--env-file` condicional.
- **`task setup` genera `JWT_SECRET`** aleatorio (`openssl rand -hex 32`) en `back-service/.env` si está vacío, y copia `mobile/.env.example` a `mobile/.env` (lo pidió el Agente D).
- **`task up` usa `--wait`:** espera a que los cuatro servicios estén healthy, así `task db:migrate` puede ir justo después.

### back-core (Agente A)
- **Secretos en producción (S1-BE-02):** no está definido cómo llegan a la instancia (SDK al arrancar vs. variables inyectadas por user-data/systemd desde Secrets Manager). `src/config/index.js` deja `resolveSecrets(env)` como punto de extensión (hoy devuelve `env` tal cual). Si se elige SDK, hace falta la dependencia `@aws-sdk/client-secrets-manager`. **Bloquea:** S1-INF-07/09.
- **413 sin código propio:** body > 100kb responde `413` con `code: VALIDATION_ERROR` (el catálogo no tiene un code para "payload demasiado grande"). Propuesta: dejarlo así o agregar `PAYLOAD_TOO_LARGE` al catálogo y a la app.
- **Orden de middlewares:** `httpLogger` va **antes** de `express.json` (03 los lista al revés) para que una request con JSON malformado también quede logueada con su `requestId`. Propuesta: actualizar la lista de [03](arquitectura/03-back-service.md#middlewares-orden-en-appjs).
- **`MONGO_DB_NAME` es obligatoria** (sin default), igual que `MONGO_URI`, `REDIS_URL` y `JWT_SECRET`. `NODE_ENV`, `PORT` y `LOG_LEVEL` tienen default (`development`, `3000`, `info`). `FEED_WEIGHTS` se acepta y se pasa sin interpretar (`config.feed.weightsRaw`) hasta que se cierre [Pesos del feed](#pesos-del-feed).
- **Cuerpo de `/internal/health`:** `{ status: 'ok' | 'degraded' | 'unavailable', checks: { mongo: 'up' | 'down', redis: 'up' | 'down' } }`, con timeout de 2 s por ping. Documentado en [06-api.md](arquitectura/06-api.md#salud); desde 2026-10-19 Redis caído es 200 `degraded` (ver [Redis](#redis)).
- **`keepAliveTimeout` de Node en 305 s** (mayor que el idle de 300 s del ALB interno) para evitar 502 intermitentes por conexiones que Node cierra antes que el ALB.
- **Rutas de módulos:** `createApp({ logger, health, routes })` monta cada `{ path, router }` de `routes` bajo `/internal`; los módulos se registran en `src/container.js`.

### back-data (Agente B)
- ✅ **Resuelto en S2.** (Antes) **Hash de contraseñas en seeds:** no hay bcrypt/argon2 instalado, así que los usuarios sembrados tienen `passwordHash: '!seed-no-login'` (no es un hash válido: no pueden iniciar sesión). Cuando auth (S2) elija la librería, el seed debería hashear una contraseña de desarrollo leída de una variable (`SEED_PASSWORD`), nunca fija en el código. Además el login debe tratar un hash con formato inválido como credenciales incorrectas (401), no como 500.
- **Lista de intereses:** los seeds usan valores de ejemplo (`futbol`, `running`, `estudio`, `musica`, `cine`, `juegos-de-mesa`) hasta que se defina la lista cerrada ([Intereses del plan](#intereses-del-plan)). Desde S2 esa es la lista inicial de `shared/interests.js` ([Lista de intereses](#lista-de-intereses)).
- ✅ **Resuelto en S4.** **Parámetros del check-in en seeds:** los planes sembrados ya llevan la ventana y el radio de check-in.
- **`down` conserva colecciones y datos:** las migraciones iniciales crean la colección con su validador; `down` quita índices y validador pero no borra la colección (borrar datos sería irreversible). `migrate:check` verifica que después de `down` no quede ningún índice salvo `_id_`.
- **Validadores más estrictos que 07 (a confirmar):** `users.email` sin mayúsculas ni espacios (garantiza la normalización de la que depende el índice único) y `checkIns` con `additionalProperties: false` (impide guardar la ubicación del participante; el modelo usa `strict: 'throw'`). `participantCount ≤ capacity` se valida con `$expr` junto al `$jsonSchema`. Todos con `validationLevel: 'moderate'`.
- **Backfill de `role`/`status` (ADR-0004):** no se escribió migración de backfill porque no hay entornos con usuarios previos; la colección nace con el validador que exige ambos campos. Si aparece una base vieja, agregar la migración de backfill de [migraciones.md](practicas/migraciones.md).
- **Mongoose 9 depreca `{ new: true }`** en `findOneAndUpdate`: el ejemplo de 07 (patrón de inscripción) debería usar `{ returnDocument: 'after' }`.
- ✅ **Resuelto en S5 (decidido el 2026-10-14, @mperez14ang).** **Idempotencia del chat (`clientId`):** campo `clientId` opcional + índice único parcial `{ senderId, clientId }` por migración, **por Socket.io y por REST**: un reintento devuelve el mensaje ya creado (REST: 200 en lugar de 201). Ver [H](#h-notas-del-sprint-5-chat).
- **Helpers para otros agentes:** `tests/helpers/db.js` (`useTestDb()` / `startDb` / `clearDb` / `stopDb`) y `tests/helpers/factories.js` (`makeUser`, `makePlan`, `makeParticipation`). `src/adapters/db/index.js` exporta además `getConnection()`; `src/adapters/db/migrations.js` expone `runMigrations`/`rollbackMigrations`/`migrationStatus` (no se llaman al arrancar la app).

### infra local + Nginx (Agente C)
- **Imágenes fijadas** (verificadas en Docker Hub el 07/10/2026): `mongo:9.0.2-noble` (última estable; el driver `mongodb@7.7` de Mongoose 9 soporta hasta 9.0), `redis:8.10.2-alpine`, `nginx:1.30.5-alpine` (rama stable), `node:22.23.3-trixie-slim` (back).
- **Versión de MongoDB en tests:** `mongodb-memory-server@11.3` usa 8.2.6 por defecto. Propuesta: fijar `MONGOMS_VERSION=9.0.2` en los tests (Agente B) y usar 9.0 también en AWS (S1-INF-08).
- **`npm run dev` se cae sin `.env`:** en Node 22.23, `node --watch --env-file-if-exists=.env` intenta vigilar `.env` y termina con `ENOENT` si no existe (también con `--watch-path`). Con `task setup` no pasa porque crea `.env`. En compose el back corre `node --watch src/server.js` (las variables las inyecta compose). Decidir si se cambia el script de `package.json`.
- **`JWT_SECRET` de desarrollo (resuelto):** el entrypoint del back ya no inventa un secreto. Llega de `back-service/.env` (lo genera `task setup`, entra por `env_file`); si falta, la config no arranca y pide correr `task setup`. En `NODE_ENV=production` la config rechaza cualquier valor que esté en el repo (se comparan hashes SHA-256).
- ⚠️ **Valor fijo viejo en el historial:** el commit `2f010fb` dejó un `JWT_SECRET` fijo de desarrollo en `infra/back/dev-entrypoint.sh`. No se reescribe el historial, pero **ese valor no puede usarse nunca fuera de local**: es público para cualquiera con acceso al repo. Producción ya lo rechaza.
- **IP del cliente en el back:** Nginx manda `X-Real-IP` y `X-Forwarded-For`. Si el back usa `req.ip`, configurar `trust proxy` de Express acorde (Agente A).
- **413 y 502/503/504 no son JSON:** Nginx devuelve sus páginas HTML (sin versión, `server_tokens off`) porque el catálogo no tiene códigos para eso. Propuesta: agregar `PAYLOAD_TOO_LARGE` (413) y `SERVICE_UNAVAILABLE` (502/503/504) al catálogo y responderlos con `error_page` en Nginx.
- **Error log y query strings:** el access log no guarda query strings, pero el error log de Nginx (p. ej. un `connect() failed` al back) incluye la línea del request completa. Con `GET /plans?lat=…&lng=…` eso son coordenadas. Refuerza la propuesta de `POST /feed` (B · Compatibilidad horaria) o hay que bajar el nivel del error log en producción.
- ✅ **Resuelto en S2 (S2-NG-01).** **Zona `auth` (10 r/min por IP) en todo `/api/v1/auth/`:** en una universidad muchos estudiantes salen por la misma IP pública (NAT), así que el login y el refresh podrían dar 429 en horas pico. Propuesta: zona estricta solo para `login`/`register`, `refresh` con la zona `api`, y calibrar con datos reales.
- **Dockerfile `prod`:** `back-service/Dockerfile` tiene un target `prod` como propuesta. 10-despliegue no define cómo corre el back en EC2 (contenedor o proceso con systemd); decidirlo en S1-INF-09.
- **WebSocket sin verificar de punta a punta:** el proxy de `/api/v1/socket.io/` está configurado (upgrade, 300 s), pero el back todavía no tiene Socket.io. Agregar la verificación a `smoke.sh` en S5.
- **CI (`nginx -t`):** usar `docker compose -f infra/docker-compose.dev.yml run --rm --no-deps nginx nginx -t`, que renderiza los templates con las variables del compose. Con la imagen sola habría que replicar montajes y variables `NGINX_*`.
- **Subred fija de compose (`172.30.0.0/24`):** necesaria para declarar la red de confianza. Si choca con otra red local, cambiarla en el compose junto con `NGINX_TRUSTED_CIDR`.

### mobile (Agente D)
- **Versiones (verificadas en npm el 2026-10-07):** Expo SDK 57 (`expo@57.0.27`, React Native 0.86.3, React 19.2.3), React Navigation 7 (`@react-navigation/native@7.5`, `native-stack@7.20`), `jest-expo@57.0.5` (sigue en **Jest 29**), `@testing-library/react-native@14` (`render`, `renderHook` y `fireEvent` son **async**; pide `test-renderer` como peer), `axios@1.20`, `axios-mock-adapter@2.1`, ESLint 9.39 + `neostandard@0.13` + `eslint-plugin-react-hooks@7.1`.
- **JSX solo en `.jsx`:** neostandard aplica las reglas de JSX únicamente a `*.jsx`. Pantallas, componentes, navegación y `App` van en `.jsx`; hooks, services y config en `.js` (coincide con [estilo-de-codigo](practicas/estilo-de-codigo.md#nombres)). Tests unitarios junto al archivo (`*.test.js(x)`); helpers de test en `mobile/tests/helpers/`.
- **Health que usa la app:** `GET /api/v1/health` (Nginx → `/internal/health`), **no** el `/health` de la raíz. Ese lo contesta Nginx con texto plano y solo dice que Nginx vive; el del back recorre app → Nginx → back → MongoDB/Redis y distingue ok de degradado (503, o 200 con `status: 'degraded'` si Redis está caído). Supone que la reescritura genérica `/api/v1/* → /internal/*` lo cubre y que `/internal/health` no exige JWT (Agentes A y C).
- **Cuerpo del 503 del health sin definir:** la app decide "degradado" **por status** (503) y no depende del cuerpo del 503 (en un 200 sí lee `status: 'degraded'`, ver [Redis](#redis)). Si el back manda `{ code, message, requestId }` se muestra; si no, `INTERNAL` + mensaje genérico. El catálogo no tiene un código para "servicio no disponible": ¿agregar `SERVICE_UNAVAILABLE` (503)?
- **Cuarto estado de la pantalla de health:** 05 pide "cargando, vacío, error, con datos"; "vacío" no aplica a un health, así que se usa **degradado** (503, o 200 con `status: 'degraded'`) como cuarto estado.
- **Códigos de error que genera solo la app** (no están en [errores-y-logs](practicas/errores-y-logs.md); llevarlos a la sección "En la app"): `NETWORK_ERROR` (status 0, sin respuesta), `TIMEOUT` (status 0, timeout del cliente, 10 s), `REQUEST_CANCELED` (status 0, `AbortController`), `UNKNOWN_ERROR` (status sin código genérico y sin `code` en el cuerpo, o error de programación). Si la respuesta no trae `code` se usa uno del catálogo por status: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 429 `RATE_LIMITED`, ≥ 500 `INTERNAL`. `requestId` sale del cuerpo y, si falta, del header `X-Request-Id`.
- **URL por perfil de EAS:** `development` → `http://10.0.2.2:8080/api/v1` (10.0.2.2 es el host visto desde el emulador Android; 8080 es Nginx de docker-compose). En un development build la URL efectiva es la del `mobile/.env` de quien corre `expo start` (Metro sirve el manifiesto); para teléfono físico, la IP LAN de la máquina. HTTP en claro solo funciona en el build debug (`development`): `preview`/`production` tienen que ser HTTPS.
- **Dominios de `preview` y `production` sin definir** (depende de S1-INF-10): en `eas.json` quedan marcadores `*.invalid` y `app.config.js` **aborta un build de EAS** que los use. Reemplazarlos cuando exista el DNS.
- **`app.config.js` falla si falta `EXPO_PUBLIC_API_URL`** (igual que el back sin `MONGO_URI`). `task setup` no crea `mobile/.env`: agregar `test -f mobile/.env || cp mobile/.env.example mobile/.env` al Taskfile (fuera de `mobile/`, no lo toqué). Lint y tests no necesitan `.env`.
- **Falta identidad de la app para EAS:** `android.package` / `ios.bundleIdentifier` y el `projectId` (`eas init`, cuenta Expo del equipo). EAS los pide en el primer build; no los inventé.
- **`task mobile:start`** usa `--dev-client` (necesita el development build instalado). Para Expo Go: `npm run start:go`.
- **`npm audit`:** 35 avisos (moderados/altos), todos transitivos del toolchain de Expo/Metro/Jest; `audit fix --force` rompe la SDK. Revisar al subir de SDK.
- **Sin probar en emulador ni teléfono:** verificado con tests, lint, `expo-doctor` (21/21) y `expo export --platform android`.

## D. Notas del sprint 2

Lo que apareció al implementar auth y perfiles (S2) y queda para revisar con el equipo. Las decisiones ya tomadas ([sesiones múltiples](#sesiones-múltiples), [fecha de nacimiento](#fecha-de-nacimiento-y-ubicación-del-perfil), [perfil completo](#perfil-completo)) se implementaron tal cual; abajo, lo que **no** estaba definido y se resolvió con la opción más chica. Cada punto se puede cambiar sin tocar el resto.

### Lista de intereses
✅ **Resuelto en S2b:** los intereses ya no son una lista fija del código. Son el catálogo `interests` (8 categorías, 57 opciones) que edita el admin en S6 ([ADR-0009](arquitectura/adr/0009-catalogos-en-la-base.md)). La lista inicial es una propuesta del equipo de desarrollo: **falta revisarla con el equipo** (qué categorías y opciones, orden, y qué opciones llevan edad mínima).

### Visibilidad del perfil público
✅ **Decidido (2026-10-12, Paula) e implementado en S4:** la vista para otros usuarios (`serializePublic`) lleva `id`, `name`, `photoUrl` y **`reputation`**: se ve en el creador de cada plan y en la lista de anotados. Las ausencias (`noShow`) nunca se muestran a otros. `birthDate`, `age`, `neighborhood`, `city` y la universidad siguen solo para el dueño.

### Decisiones de implementación a confirmar
- **Logout sin body.** El informe/06 decía `POST /auth/logout` con `refreshToken` en el body (❓). Se resolvió con `sid` dentro del access token: `logout` y `logout-all` solo necesitan el `Authorization`. Consecuencia: si el access venció, la app lo refresca primero (lo hace el cliente HTTP solo).
- **`login` devuelve también `user`** (además de los tokens, que era lo documentado) y los perfiles incluyen `profileComplete` (derivado). Cambios compatibles.
- **"Sesión más antigua" = por `createdAt`.** Al abrir la sexta sesión se revoca la creada primero, aunque se use todos los días. Alternativa: la menos usada (`lastUsedAt`), que no expulsa al teléfono principal.
- **Zona horaria de "hoy": `America/Montevideo`** para validar `birthDate` (no futura, 16–100 años) y calcular `age`. En UTC la edad subiría 3 horas antes del cumpleaños. Si la app sale de Uruguay, hay que parametrizarla. Quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos.
- **`PUT /users/me` es parcial** y exige al menos un campo. Largo máximo de `name`: 80 (no estaba definido).
- **No se puede dejar vacío** un campo de universidad, carrera, ciudad o barrio ya elegido (solo cambiarlo por otro, incluida "Otra"); la carrera y el barrio sí se quitan solos cuando cambia la universidad o la ciudad. Propuesta: aceptar `null` para quitarlos.
- ✅ **Resuelto en S2b:** el registro pide solo nombre, email y contraseña; el resto se completa en el onboarding o en el Perfil.
- ✅ **Resuelto en S3:** `planId` en `POST /uploads/presign` genera una clave `plans/<planId>/…` solo para el creador del plan.
- **Enrutado estricto** en toda la API (`case sensitive routing` + `strict routing`): `/internal/health/` y `/auth/LOGIN` dan 404. Es defensa en profundidad del límite de Nginx. **El equipo de AWS debe confirmar que el health check del ALB usa `/internal/health` sin barra final y con esa capitalización.**
- **Zod con mensajes en español** (`z.config(z.locales.es())` en `shared/validation.js`) y los campos desconocidos se informan en `details` con el nombre del campo.
- **`sanitizeFilter` de Mongoose** (mencionado en 09 como red adicional) **no se activó**: reescribe los operadores (`$gt`, `$in`) de nuestras propias queries salvo que se marquen como confiables. La barrera sigue siendo Zod `.strict()` + queries armadas en el repositorio. Decidir si se activa y se marcan las queries propias.
- **Parámetros de Argon2id:** el mínimo de OWASP (19 MiB, 2 pasadas, 1 hilo). Subirlos no requiere migrar (cada hash guarda los suyos); medir en la instancia de AWS.

### Límites conocidos
- **Access token tras el logout:** sigue valiendo hasta 15 minutos (`authenticate` no mira la sesión). Alternativa: consultar la sesión en cada request (una lectura más).
- **Refresh concurrente:** dos refresh simultáneos con el mismo token se tratan como reuso y cierran la sesión. La app hace un solo refresh en vuelo; el riesgo que queda es que la app se cierre entre que el servidor rota el token y que la app lo guarda en SecureStore (la próxima vez pedirá iniciar sesión).
- **Sesiones:** `deviceLabel` es solo una etiqueta (`android`/`ios`); no hay endpoint para listar o cerrar una sesión puntual desde otro dispositivo.
- ✅ **Resuelto en S6.** **Suspender un usuario** (`PATCH /admin/users/:id`) llama a `authService.revokeAllSessions(userId)` y cierra sus sockets. (La nota decía que un access token vigente seguía valiendo 15 minutos: no era así, `authenticate` ya mira el `status` del usuario en cada request.)

### Fotos (S3) y lo que falta del lado de AWS
- **Para el equipo de AWS (no se tocó `infra/`):** bucket privado con Block Public Access y variables `S3_BUCKET` y `AWS_REGION` en el entorno del back (obligatorias en producción). El rol IAM de la instancia necesita `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre `users/*` y **`s3:ListBucket` sobre el bucket**: sin `ListBucket`, `HeadObject` de una clave inexistente devuelve 403 en lugar de 404 y el back lo trata como error 500. No hace falta CORS (la app es nativa).
- **Sin bucket (desarrollo local) la subida de fotos no funciona de punta a punta:** el storage en memoria devuelve URLs `storage.memory.invalid`, que ningún teléfono puede alcanzar; el resto del flujo (presign, confirmación, `photoUrl`) se prueba solo con tests. Para probar la subida real hay que apuntar a un bucket de desarrollo o sumar MinIO/LocalStack al compose.
- **Contenido de la imagen:** `HeadObject` solo ve el tipo y el tamaño declarados. Verificar los magic bytes (leer los primeros bytes con `GetObject`) queda pendiente.
- **Compresión:** la app comprime al 80 % al elegir la foto; si igual pesa más de 5 MB se muestra un error (no hay `expo-image-manipulator`). iOS puede entregar HEIC: con la compresión el selector lo convierte a JPEG, pero no está probado en un iPhone.
- **`photoUrl` cambia en cada respuesta** (URL firmada de 10 minutos): la caché de imágenes de la app no la reutiliza. Si molesta, cachear por `photoKey` (habría que exponerlo) o subir la vigencia.
- **El `S3Client` usa `requestChecksumCalculation: 'WHEN_REQUIRED'`.** Con el valor por defecto del SDK actual la URL firmada lleva un checksum CRC32 del body vacío y S3 rechaza la subida real.

### Sin probar
- **La app no se probó en emulador ni en teléfono.** Verificado: tests (jest-expo), lint, `expo-doctor` y `expo export --platform android`. Sin probar: `expo-secure-store`, `expo-image-picker` y `@react-native-community/datetimepicker` nativos, los permisos que agregan sus plugins al manifiesto (`cameraPermission: false` en el plugin de imágenes), teclado y layout reales, y el flujo completo contra un bucket de S3 real.
- La app contra el back real tampoco se probó de punta a punta; sí el back por HTTP (Supertest y `curl` a través de Nginx local) y el smoke test de Nginx.

## E. Notas del sprint 2b: catálogos y onboarding

Decididos con Phillip el 2026-10-11 (ver [ADR-0009](arquitectura/adr/0009-catalogos-en-la-base.md)): todo en la base, carreras ligadas a la universidad, "Otra" sin texto libre, solo Montevideo, edad mínima en algunas opciones, todo salteable en el onboarding, registro sin fecha de nacimiento, y el CRUD del admin en S6. Lo que quedó abierto o se resolvió con la opción más chica:

### Datos de los catálogos
- **Solo Montevideo.** Se interpretó "solo Montevideo" como una única ciudad en el catálogo (con sus 62 barrios) más "Otra". Agregar Canelones, Maldonado u otra ciudad es solo datos (`catalogs/geography.js` + `npm run catalogs:sync`, o el admin), sin cambios de código. Los barrios son las **62 áreas del INE** ([codificador](https://www5.ine.gub.uy/documents/Codificadores/Barrios%20Montevideo/Codificador%20de%20barrios%20Montevideo.pdf)): algunos nombres agrupan barrios vecinos ("Capurro, Bella Vista", "Castro, P. Castellanos"). Si se prefiere la lista de la Intendencia, hay que reemplazarla.
- **Carreras relevadas el 2026-10-11 de los sitios oficiales**, solo de **grado** (sin tecnicaturas, tecnólogos, ciclos iniciales, cursos, diplomas, posgrados ni carreras de menos de 3 años): UM 26, ORT 30, UCU 53, Udelar 102, UDE 21, UCLAEH 6, UTEC 12 (250 en total). Fuentes en `back-service/catalogs/careers.js`. Para revisar con el equipo:
  - ORT sale de la API pública de su propio sitio (nivel "Carrera universitaria"); Udelar, de su buscador de carreras (se descartaron las de menos de 36 meses y las tecnicaturas/tecnólogos); UCU, de `carreras.ucu.edu.uy` (se quitaron 6: 2 años o menos, tecnicaturas y la profesionalización de Enfermería).
  - Las páginas de UDE y UCLAEH se leyeron con un navegador común; UDE puede tener carreras que solo figuran en su campus virtual.
  - **Sedes:** UCU y Udelar dictan algunas carreras solo en el interior o en Punta del Este; el catálogo no distingue sede.
  - **Agrupación:** en UM, ORT, UDE, UCLAEH y Udelar el `group` es la facultad del sitio; en UCU es un área propia (su sitio no agrupa).
  - UM: se omitió "Negocios Digitales (Online)" (misma carrera, otra modalidad). UCLAEH: el sitio escribe "Fonaudiología"; se corrigió a "Fonoaudiología".
  - Los institutos universitarios (IUACJ, Crandon, Francisco de Asís, Mariano Soler, BIOS…), el IPA, los CERP y UTU no están: los suma el admin o se piden.
- **Intereses:** 8 categorías y 57 opciones propuestas por desarrollo ([lista en el ADR](arquitectura/adr/0009-catalogos-en-la-base.md)); incluyen opciones típicas de Uruguay (pádel, mate en la rambla, candombe). "Bares y cervecerías" y "Salir a bailar" tienen `minAge: 18`; si no se quiere esa distinción, se quita el `minAge` desde el admin.
- **Máximo de intereses: 10** (antes 5), con 3 recomendados en la app. No es obligatorio llegar a 3.

### Reglas que se resolvieron con la opción más chica
- **Un menor o quien no cargó la fecha de nacimiento no ve las opciones con edad mínima.** Si más tarde cambia su fecha a una que lo deja por debajo de la edad mínima de una opción que ya eligió, el back lo rechaza (tiene que sacar esa opción primero).
- **Desactivar una opción** (admin) la oculta para elecciones nuevas pero no se la quita a quien ya la tenía.
- **Caché de 60 s por instancia** de los catálogos en el back: un cambio del admin tarda hasta un minuto en verse. Alternativa: invalidar por Redis.
- **Los datos iniciales viven en `back-service/catalogs/`**, no dentro de la migración. La migración `seed-catalogs` toma los datos vigentes al correr; una base ya migrada recibe lo nuevo con `npm run catalogs:sync` (solo inserta, nunca pisa lo que el admin editó). Una corrección de un nombre ya cargado hay que hacerla desde el admin: `catalogs:sync` no la aplica.
- **La migración de usuarios existentes** convierte el texto libre a keys si coincide con un nombre o sigla (sin tildes ni mayúsculas) y si no pasa a `other` (sin conservar el texto). `down` no revierte los datos.
- **`GET /catalogs` pide sesión.** Está pensado para el onboarding (ya logueado); no hace falta en el registro.
- **Los catálogos solo se piden una vez por sesión de la app** (caché en memoria). Si el admin cambia algo, la app lo ve al reabrirse. El caché offline entra en S6.

### Onboarding
- **Todo opcional**, con "Saltar este paso" en cada paso y "Más tarde" para salir en cualquier momento. Terminar, saltar el último paso o "Más tarde" marcan `onboardingCompleted` y **no vuelve a aparecer**; lo que falte se completa desde el Perfil (que avisa que el perfil está incompleto). Alternativa: mostrar un recordatorio cada tanto.
- **Cada "Siguiente" guarda ese paso**, así que cerrar la app a mitad no pierde lo cargado; al reabrir empieza de nuevo en el paso 1 con lo ya guardado.
- **"Saltar" no guarda lo elegido en ese paso** (se descarta).
- Pasos: 1 (fecha de nacimiento y foto), 2 (universidad, carrera, ciudad y barrio), 3 (intereses por categoría).
- **Sin probar en emulador ni teléfono**, igual que el resto de la app: el selector con buscador (`Modal` + `FlatList`) y el selector de fecha nativo.

## F. Notas del sprint 3: planes y feed

Decidido con Paula el 2026-10-12 (ver arriba: [intereses](#intereses-del-plan), [compatibilidad horaria](#compatibilidad-horaria), [paginación](#paginación-del-feed), [radio](#radio-del-feed), [filtros, costo, llenos y cupo ilimitado](#filtros-del-feed-costo-y-planes-llenos), [visibilidad](#visibilidad-de-planes), [pesos](#pesos-del-feed), [aviso de cupo](#aviso-de-cupo-liberado)). Lo que quedó abierto o se resolvió con la opción más chica:

### Impacto en S4 (inscripciones)
- **Cupo ilimitado y la transacción de cupo.** El patrón `incrementIfCapacity` documentado usaba `$lt: ['$participantCount', '$capacity']`, que con `capacity: null` da siempre falso: un plan sin límite rechazaría todas las inscripciones con `PLAN_FULL`. La condición correcta ya está en [07](arquitectura/07-modelo-de-datos.md#transacciones) (`$or` con `capacity` nulo) y es la misma del filtro `availability=available`. El test de concurrencia de S4 tiene que cubrir también un plan ilimitado (N inscripciones simultáneas → N exitosas). El resto no cambia: el contador y el registro siguen en la misma transacción.
- **Bajar el cupo mientras hay inscripciones en curso** ya es seguro: `PATCH capacity` es una actualización condicional sobre `participantCount`, y el validador de MongoDB rechaza un `participantCount` mayor al cupo.
- **Planes llenos:** el botón de inscribirse (S4-MOB-01) se deshabilita con `isFull`; el back responde `PLAN_FULL` igual.
- **`status` no se editaba por `PATCH`** en S3. Desde S4 el creador cierra, reabre o cancela ([estados del plan](#estados-del-plan)).
- ✅ **Feed (decidido el 2026-10-12, Paula; implementado en S4):** ya no incluye los planes creados por el propio usuario ni aquellos en los que tiene inscripción activa.
- **Aviso de cupo liberado:** diseñado, sin implementar. Pasó completo a S5 (S5-BE-10 y S5-MOB-06).

### Reglas que se resolvieron con la opción más chica
- **`startsAt` tiene que ser futuro** al crear, y al editar solo si se cambia (un plan en curso se puede editar sin tocar el inicio). No hay un máximo de anticipación.
- **Un plan `cancelled` o `completed` no se edita** (409 `PLAN_CLOSED`); uno `open` o `closed`, sí.
- **Visible "hasta que termina"** (`endsAt`), no hasta que empieza: un plan en curso se sigue viendo. Los listados, en cambio, solo traen planes que todavía no empezaron.
- **"Inscripto" = inscripción activa.** Quien se dio de baja deja de ver un plan cancelado o terminado.
- **`plans.university`** es la del creador al momento de crear; no se actualiza si el creador cambia de universidad. Puede ser `null`.
- **Intereses del filtro: "al menos uno"** (no "todos"). El catálogo de intereses del filtro es el del perfil.
- **Los planes anteriores a S3** (datos de desarrollo) quedaron con `endsAt = startsAt + 2 h` y `price = 0` por migración. Las tres migraciones de planes de S3 salen juntas: como todavía no hay una versión desplegada, no se hizo en dos pasos (expand/contract).
- **`description` se puede vaciar** con `PATCH description: ""`; sale `null`.
- **`GET /plans/filters`** es un endpoint nuevo (no estaba en el informe): existe para que los rangos de precio vivan solo en el back.
- **Moneda:** pesos uruguayos, sin campo de moneda. Si la app sale de Uruguay hay que agregarlo.
- **El score no se expone** en la respuesta (solo el orden y `distanceMeters`).
- **Cursor del feed:** si el usuario cambia de filtros, radio o posición, el cursor viejo es 400 y la app vuelve a pedir la primera página (lo hace sola: cada cambio recarga el feed). La ubicación se toma una vez por recorrido; al refrescar se vuelve a leer.

### Límites conocidos
- **Tope de 200 candidatos:** con más de 200 planes dentro del radio se rankean los 200 más cercanos; un plan muy afín pero más lejano queda afuera hasta que el usuario achica el radio o filtra.
- **Entre páginas del feed** un plan puede llenarse o cambiar: la página siguiente se calcula de nuevo, así que en ese caso puede saltearse o repetirse un plan (la app descarta los repetidos). Planes nuevos aparecen al refrescar.
- **`photoUrl` del plan cambia en cada respuesta** (URL firmada de 10 minutos), igual que la del perfil.
- **La app no sube todavía la foto del plan**: ver la [tarea pendiente](#tarea-pendiente-foto-del-plan-desde-la-app).
- **Compatibilidad horaria:** los eventos de día completo no cuentan como ocupado; el calendario se lee al cargar o refrescar el feed, no en cada página.
- **Sin caché offline** del feed ni del detalle (S6).

### Tarea pendiente: foto del plan desde la app
**Para un próximo sprint (sin asignar).** El back ya está listo desde S3: `POST /uploads/presign` con `planId` (clave `plans/<planId>/…`, solo el creador) y `PUT /plans/:id/photo` (verifica creador, prefijo, existencia, tipo y tamaño reales), y el plan devuelve `photoUrl`. Falta la parte de la app:
- En crear/editar plan (o en el detalle, para el creador): elegir la imagen, `presign` con `planId` → `PUT` directo a S3 → `PUT /plans/:id/photo`. Reutilizar `services/photoUpload.js` e `imagePicker.js` de la foto de perfil (hoy `uploadProfilePhoto` no acepta `planId` y el selector recorta cuadrado: definir la proporción de la foto del plan).
- Al crear, el plan tiene que existir antes de subir la foto (primero `POST /plans`, después la foto).
- Mostrar `photoUrl` en `PlanScreen` y en `PlanCard`.
- Depende de que el rol IAM del back tenga permisos sobre `plans/*` (ver abajo).

### Para el equipo de AWS / configuración (no se tocó `infra/`)
- **S3:** el rol IAM del back necesita los mismos permisos que para `users/*` también sobre **`plans/*`** (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`).
- **Google Maps:** crear en Google Cloud una clave de "Maps SDK for Android" por entorno, restringida al paquete de la app y a la huella SHA-1 de su certificado, y cargarla en EAS como `GOOGLE_MAPS_ANDROID_API_KEY` ([09](arquitectura/09-seguridad.md#secretos)). El paquete de la app es **`com.junte.app`** (`android.package` e `ios.bundleIdentifier` en `mobile/app.config.js`, decidido el 2026-10-12): la clave se restringe a ese paquete.
- **`FEED_WEIGHTS`** es opcional; si se define tiene que ser JSON válido o el back no arranca.

### Sin probar
- **Probada por Paula en un teléfono con Expo Go (2026-10-12): funciona.** Además: tests (jest-expo), lint y `expo export --platform android`. Sigue sin probarse en un **development build / APK** (el mapa ahí usa la clave de Google Maps propia, que todavía no existe) ni de forma sistemática caso por caso: el mapa (`react-native-maps`, necesita la clave y un development build), arrastrar el pin, el geocodificador del teléfono (`expo-location`; la calidad de las búsquedas depende del dispositivo), los permisos de ubicación y calendario, los dos diálogos de fecha y hora de Android, los tabs y el scroll infinito con datos reales.
- **`expo-calendar` declara también el permiso de escritura** del calendario en Android (lo agrega su plugin); la app solo lee. Si se quiere quitar hay que probar en un teléfono que el pedido de permiso siga funcionando.
- La app contra el back real no se probó de punta a punta; el back sí, por HTTP (Supertest) y contra MongoDB en memoria.
- `expo-doctor` avisa de tres parches menores disponibles (`expo`, `expo-dev-client`, `jest-expo`), anteriores a este sprint: no se actualizaron.

## G. Notas del sprint 4: inscripciones, asistencia y reputación

Decisiones en [s4-decisiones.md](tareas/s4-decisiones.md) (2026-10-12, Paula). Lo que quedó abierto o se resolvió con la opción más chica:

### Reglas confirmadas
✅ **Confirmadas por Paula el 2026-10-12**, con tres cambios (QR anterior, pantalla encendida y refresco del detalle) y una decisión nueva (feed).

- ✅ **QR: al renovarlo, el anterior sigue valiendo 10 segundos** (cambio pedido al confirmar; antes uno nuevo invalidaba el anterior en el acto). Nunca más allá de su propio vencimiento, y solo se conserva uno: el anterior al anterior deja de valer. La pantalla del creador lo renueva 15 segundos antes de que venza.
- ✅ **El lock de los jobs no se libera al terminar: vence solo** (a los 54 s, con un ciclo de 60 s). Si se liberara, otra instancia con el reloj un poco corrido repetiría el job en el mismo ciclo. Además cada job es idempotente (actualizaciones condicionales), así que una repetición no duplica nada.
- ✅ **`attendanceClosedAt` en `plans`** marca que el cierre de asistencia ya corrió.
- ✅ **El mínimo de asistentes para el +1 del creador (2)** es una constante en `shared/attendance.js`, junto con el resto de los parámetros. Cambiarlo es un cambio de código.
- ✅ **Cambio de estado por `PATCH`:** `status` va solo en el body; pedir el estado que el plan ya tiene responde 200 sin cambios.
- ✅ **Check-in ya hecho se informa antes que el horario:** un segundo intento fuera de la ventana responde `ALREADY_CHECKED_IN`, no `CHECKIN_WINDOW_CLOSED`.
- ✅ **`OUT_OF_RANGE` es un solo código** para "lejos" y "GPS impreciso"; el `message` del servidor dice cuál (la app lo muestra tal cual).
- ✅ **`noShowCount` solo sale en `GET /users/me`.** `PUT /users/me`, el registro y el login no lo devuelven; la app lo pide al abrir el perfil.
- ✅ **Un plan cancelado deja de ser visible** para quien no es su creador ni tiene inscripción activa: inscribirse responde 404, no `PLAN_CLOSED`.
- ✅ **Anotados dentro del detalle del plan:** la lista va paginada de a 20 con un botón "Ver más" (no es una pantalla aparte).
- ✅ **Feed sin planes propios ni inscriptos** (decisión nueva): `GET /plans` y `POST /feed` no traen los planes que creó el usuario ni aquellos en los que tiene inscripción activa; esos están en "Mis planes". Quien se da de baja vuelve a verlo. Cierra el punto abierto de S3.

### App
- ✅ **Cuarto tab "Mis planes"** (Voy / Organizo, Próximos / Pasados). El detalle del plan, el QR y el check-in se abren dentro del tab desde el que se entró.
- ✅ **Acciones del creador en el detalle:** cerrar y reabrir inscripciones y cancelar el plan (con confirmación). No estaban en las tareas de la app, pero sin ellas los cambios de estado no se podían usar.
- **Dependencias nuevas:** `expo-camera` (leer el QR; sin micrófono), `react-native-svg` y `react-native-qrcode-svg` (dibujar el QR) y `expo-keep-awake`.
- ✅ **La pantalla del QR queda encendida mientras se muestra** (`expo-keep-awake`; pedido al confirmar).
- ✅ **El detalle del plan se refresca solo** (pedido al confirmar): cuando abre o cierra el horario de asistencia, cuando el plan empieza o termina, y cuando la app vuelve a primer plano. El botón de asistencia aparece sin salir y volver a entrar. Si el próximo de esos momentos está a más de un día, no se programa nada (se refresca al volver a la app).

### Límites conocidos
- **Relojes:** la ventana, el vencimiento del QR y el cierre usan la hora del servidor. Entre dos instancias con relojes corridos, un check-in en el último segundo de la ventana podría entrar justo después del cierre de asistencia y quedar con check-in **y** `noShow`. Requiere una diferencia de reloj mayor al margen entre requests; se documenta, no se resolvió.
- **Fraude:** un QR reenviado por mensaje o una ubicación simulada pasan los controles (límite que ya reconoce el informe). El QR corto y el radio lo dificultan, no lo impiden.
- **Sin Redis los jobs no corren** (se loguea un `warn` por ciclo). Las ausencias y el `completed` se ponen al día solos cuando Redis vuelve.
- **El scheduler procesa hasta 100 planes por job y por ciclo**; lo que quede pasa al ciclo siguiente.
- **Editar las fechas de un plan con la asistencia ya cerrada** recalcula la ventana pero no reabre la asistencia.

### Sin probar
- **Sin probar en un teléfono:** la cámara (`expo-camera`), la lectura real del QR, la precisión del GPS en interiores, el dibujo del QR, que la pantalla quede encendida (`expo-keep-awake`) y el refresco al volver a primer plano. Verificado: tests (jest-expo), lint, `expo-doctor` y `expo export --platform android`.
- ✅ **Dos instancias reales del back contra un Redis real** (criterio de aceptación de S4-BE-08): verificado el 2026-10-14 con docker-compose (perfil `scale`): en cada ciclo una instancia corre el job y la otra lo saltea por el lock.
- La app contra el back real no se probó de punta a punta; el back sí, por HTTP (Supertest) y contra MongoDB en memoria con replica set.

### Para investigar
- **Aviso intermitente de consola en los tests de la app.** En dos corridas completas de `npm test` (mobile) del 2026-10-12, Jest mostró un bloque `● Console` en alguna suite, sin que fallara ningún test. No se pudo reproducir en las corridas siguientes (cinco seguidas, incluida la de `task ci`), así que no se sabe de qué suite viene ni qué dice. Sospecha sin confirmar: una actualización de estado fuera de `act()` en alguna pantalla con efectos asíncronos (las suites que se agregaron en S4 usan timers y promesas diferidas), que solo aparece cuando la máquina está cargada. Para encontrarlo: correr `npx jest --runInBand` varias veces guardando la salida completa, o hacer fallar los tests ante cualquier `console.error`/`console.warn` en un `setupFilesAfterEach`.

## H. Notas del sprint 5: chat

Decidido con @mperez14ang el 2026-10-14: el **chat completo** (S5-BE-01 a 05 y S5-NG-01 del lado local en el PR del back; S5-MOB-01 y 02 en el PR de la app, apilado sobre el del back); devices, FCM, avisos, recordatorio, `spotAlerts` y notas de voz van en PRs siguientes. `clientId` por socket y por REST ([idempotencia](#back-data-agente-b)); notas de voz aprobadas para después ([notas de voz](#notas-de-voz-y-contactos)). Lo que quedó abierto o se resolvió con la opción más chica:

### Reglas que se resolvieron con la opción más chica
- **El chat funciona en cualquier estado del plan** (abierto, cerrado, cancelado, completado o ya terminado) para quien tenga acceso: participante activo o creador. Alternativa: dejarlo de solo lectura cuando el plan se cancela o termina.
- **El creador siempre tiene chat**, aunque no esté inscripto o se dé de baja.
- **Darse de baja quita el acceso** (403) y saca al usuario de la sala en tiempo real en todas las instancias (sala `user:<id>`). Su historial anterior no se borra: si se vuelve a inscribir lo ve completo.
- **El mismo `clientId` en otro plan** es 400 (no es un reintento). El mismo `clientId` de dos personas son dos mensajes.
- **`chat:message` llega también a quien lo mandó** (la app fusiona por `id`/`clientId`); un reintento por `clientId` no se vuelve a emitir.
- **`type: 'text'`** se guarda desde ahora para que las notas de voz no necesiten backfill. Sin `type` (mensajes de desarrollo anteriores) cuenta como texto.
- **Forma del mensaje** (no estaba definida): `{ id, planId, sender, type, text, clientId, createdAt }`, con `sender` = vista pública del usuario ([06](arquitectura/06-api.md#chat)). `status` no sale para usuarios comunes.
- **`chat:join` y una baja simultánea:** después de unir el socket a la sala se vuelve a verificar el permiso; si en el medio terminó una baja, sale de la sala y responde `FORBIDDEN`.
- **Errores por socket:** el ack lleva `{ error: { code, message, requestId } }` con un `requestId` generado por evento (no hay header). Un usuario suspendido recibe `ACCOUNT_SUSPENDED` y se le cierra la conexión.

### Para los próximos PRs de S5
- **FCM (S5-BE-07, S5-MOB-03/04): no hay proyecto de Firebase todavía** (2026-10-14). Hace falta que alguien del equipo lo cree y cargue: `google-services.json` para el development build (EAS) y una cuenta de servicio para el back (Secrets Manager / `.env`, nunca en Git). Mientras tanto el adapter de FCM se puede hacer detrás de una interfaz con una implementación en memoria para desarrollo y tests.

### Límites conocidos
- **Sin rate limit de eventos de socket:** Nginx limita la conexión (upgrade), no los mensajes dentro del WebSocket. Un cliente podría mandar muchos `chat:send` seguidos. Propuesta: un límite por usuario en Redis (p. ej. 20 mensajes cada 10 s) si se ve abuso.
- **Token vencido con la conexión abierta:** la conexión sigue hasta que se corta (límite ya aceptado en [08](arquitectura/08-tiempo-real-y-push.md#autenticación-y-autorización)); en cada evento sí se verifica que el usuario siga activo.
- **A confirmar con el equipo (salió en la revisión):** con el socket abierto, un `logout` o `logout-all` no corta la conexión (en cada evento se mira que el usuario esté activo, no que la sesión siga vigente; igual que el HTTP, que no consulta `sessions`), y un usuario suspendido que solo escucha sigue recibiendo mensajes hasta que manda un evento o se reconecta. Propuesta si no se acepta: guardar el `sid` en el socket, verificar la sesión en cada evento, y que `logout-all` / la suspensión (S6) desconecten los sockets del usuario con `io.in('user:<id>').disconnectSockets()`.
- **Cursores con un instante fuera de rango** (salió en la revisión): un cursor manipulado con un número que no entra en un `Date` daba 500 en todos los listados (planes, anotados, feed y chat). Ahora es 400 (`cursorInstantField` en `shared/pagination.js`).
- **Sin Redis**, cada instancia emite solo a sus propios clientes; el resto ve los mensajes por el polling REST de la app.
- **Moderación:** el evento `chat:hidden` y `PATCH /admin/messages/:id` son de S6; el historial ya filtra los `hidden`.

### Validación en local (2026-10-14)
Cómo se corre cada prueba: [pruebas en local](practicas/pruebas-en-local.md).
- ✅ **Dos instancias con Redis** (S5-BE-05): `task chat:two-instances` OK, en los dos sentidos.
- ✅ **WebSocket a través de Nginx:** `nginx -t` y `smoke.sh` OK (30/30, con el upgrade a WebSocket y el long-polling rechazado).
- ✅ **E2E del chat por Nginx** (un agente, con REST y Socket.io como la app): permisos (403 por REST y socket), validaciones, paginación sin duplicados, cursores manipulados → 400, idempotencia por `clientId` (socket + REST), mensajes entre instancias, la baja saca de la sala en las dos instancias, recuperación del historial al reconectar, refresh del token, y el texto de los mensajes nunca aparece en los logs de back ni de Nginx.
- **Falta en AWS** (S5-NG-01): que una conexión ociosa 5 minutos siga viva a través de los dos ALB.

### App
- **Dependencia nueva:** `socket.io-client` 4.8.
- ✅ **Botón "Chat del plan"** en el detalle, solo para el creador o un participante activo; el chat se abre dentro del tab desde el que se entró (como el QR y el check-in).
- **Opción más chica:** páginas de 30 mensajes; sin cola offline (un envío fallido se reintenta a mano, con el mismo `clientId`); un mensaje pendiente se ordena arriba de los confirmados (el reloj del teléfono puede estar corrido); un `type` desconocido se muestra como "Mensaje no compatible con esta versión de la app".
- **Reconexión tras un rechazo del servidor** (salió en la revisión): si el servidor rechaza la conexión por algo que no es el token (p. ej. `INTERNAL` con la base caída), Socket.io no reintenta solo; la app vuelve a intentar cada 3 s y, al tercer fallo seguido, pasa al polling. Un "Reintentar" de la pantalla ya no descarta los mensajes pendientes o fallidos.
- **Hueco en el historial:** si al reconectar la primera página no comparte ningún mensaje con lo que se veía, se reemplaza la lista por esa página (no se muestra un hueco).
- **Carrera conocida:** un mensaje enviado entre la carga de la primera página y el `chat:join` puede no verse hasta la próxima reconexión o refresco. La recuperación al conectar la achica, pero no la cierra del todo.
- ✅ **Probada en el simulador de iOS (iPhone 17, Expo Go) contra el back local, el 2026-10-14**, con un agente usando la app y la otra persona simulada por REST/socket: botón y estado vacío, mensajes en tiempo real, envío confirmado una sola vez, botón deshabilitado con el campo vacío, historial hacia atrás sin duplicados, banner de polling y "Reintentar" con Nginx caído (el mensaje se mandó una sola vez), y la baja con el chat abierto. Checklist en [pruebas en local](practicas/pruebas-en-local.md#checklist-manual-del-chat).
- **Encontrado en esa prueba y corregido:**
  - Con una sugerencia del autocorrector de iOS pendiente, después de enviar el campo se volvía a llenar con el texto corregido y se podía mandar dos veces. Ahora el campo se recrea después de cada envío (y conserva el foco).
  - Si la persona se daba de baja con el chat abierto, al enviar veía "No se envió · Reintentar", que no servía. Ahora un `FORBIDDEN`/`NOT_FOUND` al enviar lleva a la pantalla de error del chat.
- **Sin probar:** el teclado en pantalla (el simulador sin la app Simulator no lo muestra; mirarlo en un teléfono, sobre todo Android edge-to-edge) y una caída de red con "conexión rechazada": durante la prueba un Jenkins local en `127.0.0.1:8080` respondía 404 en lugar de Nginx caído (ver [puerto 8080 ocupado](practicas/pruebas-en-local.md#puerto-8080-ocupado-por-otro-servicio)). Ese camino lo cubren los tests unitarios.
- **Visto en la prueba, sin cambios:** en el detalle del plan el botón "Chat del plan" queda debajo de la barra de pestañas hasta scrollear (es el comportamiento normal del scroll); mensajes seguidos de la misma persona repiten nombre y avatar; con el aviso de polling visible, el primer mensaje queda en parte debajo del aviso.

## I. Notas del sprint 6: admin y móvil

Decidido con Domenico el 2026-10-14: [endpoints y métricas de admin](#endpoints-y-métricas-de-administración) con vista previa; **suspender solo corta el acceso** (sesiones y sockets; sus planes e inscripciones quedan como están, así es reversible); **reportes con motivos fijos** (`spam`, `harassment`, `inappropriate`, `scam`, `other`) y sin duplicados pendientes; **cola offline para chat, reportes e inscripciones** (no crear/editar planes, perfil ni estados); **AsyncStorage + NetInfo** (funcionan en Expo Go); y **la infraestructura (S6-INF-01 a 04) queda para el equipo de AWS**, sin tocar `infra/`. Lo que quedó abierto o se resolvió con la opción más chica:

### Reglas que se resolvieron con la opción más chica
- **Resolver un reporte resuelve todos los pendientes sobre lo mismo** (de cualquier persona): la decisión es sobre el contenido. Uno resuelto se puede corregir (revisado ↔ descartado), nunca volver a pendiente. Alternativa: resolver de a uno.
- **La vista previa se lee en el momento**, no es una copia del reporte: si el plan se editó después, el admin ve la versión nueva; si se borró la cuenta, `preview: null`. Alternativa: guardar una copia al reportar (más datos personales guardados).
- **Reportar a un usuario** solo exige que la cuenta exista (no que compartan un plan): los IDs de usuario solo se conocen por las vistas públicas de la app.
- **No se puede suspender a otra cuenta admin** desde el panel (primero se le quita el rol con el script) **ni a sí mismo**.
- **Volver a mostrar un mensaje oculto no emite nada**: aparece al recargar el historial. Ocultarlo sí emite `chat:hidden` (`{ planId, messageId }`: se agregó `planId` al payload documentado).
- **Catálogos por `id`**, no por `key` (06 decía `/:key`): la key de carreras y barrios solo es única dentro de su universidad o ciudad. La key y el "padre" no cambian; `department` de una ciudad también se puede editar. Se agregó el código `CATALOG_KEY_TAKEN` (409), que solo usa el panel.
- **Contraseña de una cuenta admin creada por script:** mínimo 12 caracteres, por variable de entorno (`ADMIN_PASSWORD`), nunca como argumento. `demote` nunca deja la base sin una cuenta admin activa.
- **Panel:** HTML/JS sin build y sin dependencias externas. La sesión vive solo en memoria. El login usa `deviceLabel: "panel-admin"` (cuenta como una de las 5 sesiones de esa cuenta).

### App
- **Qué se guarda:** la primera página del feed (por filtros y radio), detalles de planes (hasta 30), "Mis planes", la primera página de cada chat (hasta 20), catálogos y el propio perfil. Todo en AsyncStorage, sin cifrar (no hay tokens ni contraseñas; sí planes, mensajes y el perfil propio). Se borra al cerrar sesión o al vencerse. Alternativa si se quiere cifrar: guardar menos o usar una base cifrada.
- **La app abre sin conexión** con el último perfil guardado (antes mostraba la pantalla de "no pudimos verificar tu sesión"). El servidor sigue decidiendo si la sesión vale cuando vuelve la red.
- **Lo encolado nunca se da por hecho:** el detalle del plan dice "Inscripción pendiente… Todavía no estás inscripto" (con "Cancelar"), y un rechazo al sincronizar (p. ej. `PLAN_FULL`) queda con el motivo hasta "Entendido". La pantalla "Pendientes" (desde el aviso de conexión) lista todo con "Reintentar" y "Descartar".
- **Cuándo se manda la cola:** al volver la conexión, al volver la app a primer plano, al reconectar el chat y en cada vuelta del polling del chat. Nunca con un timer propio ni en segundo plano. Límite: si NetInfo dice "conectado" pero el servidor no responde (p. ej. Nginx caído), lo pendiente espera al próximo de esos momentos (o a "Enviar ahora").
- **Sin conexión no se ofrecen** el check-in ni el QR (dependen del momento y del lugar), con un aviso. Editar, cerrar, reabrir o cancelar un plan sin red da el error de conexión de siempre (no se encola).
- **Reportar desde la app:** el plan y quien lo organiza (detalle), cualquier anotado (lista de anotados) y un mensaje de otra persona (pulsación larga en el chat). No se reporta nada propio.
- **Segundo plano:** sin WebSocket ni polling del chat (se suelta la conexión y se recupera el historial al volver), el refresco automático del detalle no consulta al servidor, y `ACCESS_BACKGROUND_LOCATION` queda bloqueado en el manifiesto de Android.
- **Dependencias nuevas:** `@react-native-async-storage/async-storage` 2.2 y `@react-native-community/netinfo` 12.0 (las versiones que elige `expo install` para el SDK 57).

### Tests
- **Timeouts en la primera corrida de jest de la app:** con todos los workers en paralelo, el primer test de varias pantallas superó los 5 s (pasó también en la línea de base, antes de los cambios de este sprint). Con `--maxWorkers=4` pasan todos (53 suites, 730 tests). Si se repite en CI, subir el timeout o limitar los workers.
- Un `setupFilesAfterEnv` (`mobile/tests/setup.js`) vacía el AsyncStorage simulado antes de cada test.

### Sin probar
- **Nada de S6 se probó con docker compose:** Docker Desktop no arrancó en la máquina donde se hizo (se cae al iniciar porque no puede borrar un socket viejo en la carpeta `docker-secrets-engine` de AppData). Falta: `nginx -t`, `smoke.sh` (con los checks nuevos del panel) y `chat:hidden` entre dos instancias con Redis.
- ✅ **El panel se probó en un navegador** (2026-10-14) contra el back real con MongoDB en memoria y las migraciones, servido con las mismas cabeceras que Nginx y `/api/v1` reescrito a `/internal` (un entorno temporal, fuera del repo): login, cuenta sin rol rechazada, cola con vista previa, ocultar y volver a mostrar, resolver, suspender (con confirmación), métricas, catálogos (buscar, editar, agregar, key repetida → 409 con código de seguimiento) y cerrar sesión. Sin violaciones de CSP; un mensaje y un nombre con HTML (`<script>`, `onerror`) se ven como texto.
- **La app no se probó en un teléfono:** el modo avión (NetInfo real), la cola al volver la red, la pulsación larga y el aviso del chat, ni la app en segundo plano. Verificado con tests (jest) y lint.

## Front: decisiones del equipo de agentes (2026-10-17)

Decidido por el líder del equipo de agentes del front (rama `front-agentes`), sin cambios en el back ni en el contrato de la API.

- ✅ **Fotos con `expo-image`.** `Avatar` (el único que dibuja imágenes) pasa a `expo-image` con `cacheKey` = la URL sin firma (`withoutSignature`), `cachePolicy='memory-disk'`, una `transition` corta y `recyclingKey` en las listas (chat). Se borra `useStablePhotoUri`: el caché por clave ya evita la re-descarga y el parpadeo cuando el back re-firma. Si la carga falla se muestra la inicial. Al cerrar sesión se vacían los cachés de memoria y disco (son fotos de otras personas). **Es un módulo nativo: hace falta un development build nuevo** (EAS, perfil `development`); Expo Go ya lo trae.
  - Por qué: caché en disco por archivo y no por URL (hoy, al reabrir la app, cada foto llega con otra firma y se vuelve a bajar), menos lógica propia y reciclado correcto en listas largas.
- ✅ **QR: se queda `react-native-qrcode-svg`.** Ya dibuja un solo `Path`, no es nativo y funciona; cambiarla no mejora nada medible y suma riesgo antes de la entrega.
- ✅ **QR: renovación sin ocultar uno vigente.** Si falla la renovación por red y el QR que se ve todavía no venció, sigue a la vista con un aviso (`Notice` de advertencia: "Sin conexión. Este QR vale hasta las HH:MM; reintentamos solo.") y se reintenta cada 5 s (`QR_MIN_REFRESH_MS`). Recién al vencer pasa a error con "Reintentar". Si la respuesta es de "no disponible" (`CHECKIN_WINDOW_CLOSED`, `PLAN_CLOSED`…) se oculta enseguida. Lo mismo al volver de segundo plano: solo se oculta si ya venció. El cambio de un QR al siguiente es instantáneo (sin animación: un lector podría leer a mitad de un fundido).
  - Accesibilidad: el QR es una imagen con nombre ("Código QR de asistencia. Se renueva solo."); la renovación no se anuncia (sería ruido cada minuto y medio), el aviso de sin conexión sí (`polite`).
- ✅ **Chat: mensajes agrupados.** Un grupo son mensajes seguidos de la misma persona, a menos de 5 minutos entre uno y el siguiente y el mismo día. En los ajenos, el nombre va solo en el primero del grupo y el avatar solo en el último (abajo, como en cualquier chat); los demás dejan el lugar del avatar vacío para que las burbujas queden alineadas. Entre mensajes del mismo grupo el espacio es `spacing.xxs`; entre grupos, `spacing.md`. La "cola" de la burbuja (esquina chica) solo en el último del grupo. Los propios se agrupan igual (solo cambia el espaciado y la cola).
  - Accesibilidad: cada mensaje se anuncia completo aunque no se vea el nombre: "Ana: texto. 14:32" (o "Vos: …" en los propios).
  - Textos de la pantalla: "No pudimos cargar el chat" (sin punto, como el resto de los títulos de error) y, para un tipo desconocido, "Actualizá la app para ver este mensaje". El resto ya estaba en voseo y no hay ningún "Error:".
- ✅ **Selector segmentado con texto grande.** Las etiquetas pasan a hasta 2 líneas (nunca "…"). En el inicio, con `fontScale ≥ 1.3` la barra deja de ser una fila: el segmentado ocupa todo el ancho y "Filtros (n)" baja a la línea siguiente, alineado a la derecha. En "Mis planes" los dos segmentados ya van uno abajo del otro: alcanza con las 2 líneas.
  - Por qué: una regla por `fontScale` es predecible y se puede testear; un `flexWrap` dependía del largo de cada texto.

### Sin probar en un teléfono
- `expo-image` en un development build nuevo: que la foto no parpadee al re-firmar, que se vea sin red después de reabrir la app y que el caché se vacíe al cerrar sesión.
- La renovación del QR con el modo avión prendido y apagado a mitad de la vida del QR, y que un lector real lea el QR justo después de cambiar.
- El agrupado del chat con texto grande, con TalkBack y VoiceOver.
- El segmentado y la barra del inicio con el texto más grande del sistema en Android e iOS.
- Sigue abierto de S5: con el aviso de polling visible, el primer mensaje queda en parte debajo del aviso.

### Checklist manual en el teléfono
Lo que jest no cubre de estos cambios. Marcar cada punto con la fecha, el teléfono y la versión del sistema.

#### Fotos con `expo-image` (development build nuevo)

`expo-image` es un módulo nativo: hace falta un development build nuevo (EAS, perfil `development`) antes de probar. Un build viejo falla al abrir cualquier pantalla con fotos.

- [ ] El build nuevo abre sin errores en Android e iOS.
- [ ] En el chat y en la lista de participantes, las fotos no parpadean cuando llega una respuesta nueva del back (la URL vuelve con otra firma): dejar el chat abierto con polling y mirar los avatares durante un minuto.
- [ ] Sin red, al reabrir la app (matarla y volver a abrirla), las fotos que ya se vieron se siguen viendo.
- [ ] Una foto de perfil nueva (subida desde otro teléfono) sí aparece: no se queda la vieja del caché.
- [ ] Al cerrar sesión ("Cerrar sesión" y "Cerrar todas las sesiones"), en modo avión y entrando con otra cuenta, las fotos de la sesión anterior ya no aparecen (el caché se vació).
- [ ] Una foto que no carga (URL vencida o borrada) muestra la inicial, no un círculo vacío.

#### QR de asistencia

- [ ] Con el QR a la vista, prender el modo avión a mitad de su vida (unos 40 s después de que apareció): el QR sigue a la vista y, al tocar la renovación (~15 s antes de vencer), aparece "Sin conexión. Este QR vale hasta las HH:MM; reintentamos solo." con la hora correcta.
- [ ] Apagar el modo avión antes de que venza: en 5 s o menos el aviso desaparece y el QR cambia por uno nuevo.
- [ ] Dejar el modo avión hasta que venza: el QR se oculta y aparece "No pudimos mostrar el QR" con "Reintentar"; sin red no se reintenta solo, y "Reintentar" con red vuelve a mostrar uno.
- [ ] Un lector real (otro teléfono con la app, pantalla de check-in) lee el QR justo después del cambio, en el primer segundo: el cambio es instantáneo, sin fundido.
- [ ] Mandar la app a segundo plano 1 minuto y volver: si el QR todavía vale, no se oculta; si ya venció (dejarla 2 minutos), se oculta y aparece uno nuevo.
- [ ] Con el reloj del teléfono en hora automática y, después, adelantado 2 minutos a mano: el QR se muestra igual y vence a su hora: la vida del QR se mide con el header `Date` del servidor y se cuenta desde que llegó la respuesta (BUG-QA-9, corregido). No cubre cambiar el reloj durante los ~90 s del QR.
- [ ] Con TalkBack y VoiceOver: el QR se anuncia como "Código QR de asistencia. Se renueva solo."; la renovación normal no se anuncia; el aviso de sin conexión sí, sin cortar lo que se estaba leyendo.

#### Chat agrupado

- [ ] Con TalkBack (Android) y VoiceOver (iOS): cada burbuja se lee completa, "Ana: texto. 14:32" (o "Vos: …" en las propias), también las del medio de un grupo que no muestran el nombre; el avatar no se lee aparte.
- [ ] El foco del lector recorre los mensajes en orden (de arriba hacia abajo) aunque la lista esté invertida.
- [ ] Con el texto más grande del sistema: el nombre del primero del grupo, las burbujas y el avatar del último quedan alineados; nada se corta ni se superpone; el espacio entre grupos se distingue del espacio dentro de un grupo.
- [ ] Mensajes alrededor de la medianoche (23:59 y 00:01) quedan en grupos distintos.
- [ ] Un mensaje de tipo desconocido muestra "Actualizá la app para ver este mensaje".

#### Selector segmentado y barra del inicio con texto grande

- [ ] Android (Ajustes → Pantalla → Tamaño de fuente al máximo) y iOS (Accesibilidad → Pantalla y tamaño del texto → Texto más grande al máximo):
  - [ ] En el inicio, la barra pasa a columna: el segmentado ("Con cupo / Llenos") ocupa todo el ancho y "Filtros (n)" queda abajo, a la derecha.
  - [ ] Las etiquetas del segmentado usan hasta 2 líneas, sin "…", y los dos segmentos quedan del mismo alto.
  - [ ] En "Mis planes", los dos segmentados se leen enteros en 2 líneas.
- [ ] Cambiar el tamaño de la fuente con la app abierta (volver desde Ajustes): la barra cambia de fila a columna (y al revés) sin reabrir la app.
- [ ] Con el tamaño de fuente normal, la barra sigue en una fila.

### Corregido después de QA
- **BUG-QA-8:** un QR que vencía antes de su renovación dejaba la pantalla en "Generando el QR…" para siempre. Ahora se oculta y la renovación sigue en pie (o pasa a error con "Reintentar" si ya había fallado).
- **BUG-QA-9:** con el reloj del teléfono adelantado, cada QR se daba por vencido al llegar. Ahora la vida se calcula con la hora del servidor (header `Date`) y se ancla al momento en que llegó la respuesta; sin header se usa `expiresAt` tal cual.
- **Dependencias:** parches de `expo`, `expo-asset`, `expo-constants`, `expo-dev-client` y `jest-expo` alineados con `expo install --fix`; `expo-doctor` 21/21.
