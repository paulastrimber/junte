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
**Propuesta:** agregar `interests: string[]` (keys del catálogo `interests`, el mismo que usa el perfil; [ADR-0009](arquitectura/adr/0009-catalogos-en-la-base.md)) a `plans` y a `POST /plans`.
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
- **Cuerpo de `/internal/health`:** `{ status: 'ok' | 'unavailable', checks: { mongo: 'up' | 'down', redis: 'up' | 'down' } }`, con timeout de 2 s por ping. Si 06-api.md debe documentarlo, falta agregarlo ahí.
- **`keepAliveTimeout` de Node en 305 s** (mayor que el idle de 300 s del ALB interno) para evitar 502 intermitentes por conexiones que Node cierra antes que el ALB.
- **Rutas de módulos:** `createApp({ logger, health, routes })` monta cada `{ path, router }` de `routes` bajo `/internal`; los módulos se registran en `src/container.js`.

### back-data (Agente B)
- ✅ **Resuelto en S2.** (Antes) **Hash de contraseñas en seeds:** no hay bcrypt/argon2 instalado, así que los usuarios sembrados tienen `passwordHash: '!seed-no-login'` (no es un hash válido: no pueden iniciar sesión). Cuando auth (S2) elija la librería, el seed debería hashear una contraseña de desarrollo leída de una variable (`SEED_PASSWORD`), nunca fija en el código. Además el login debe tratar un hash con formato inválido como credenciales incorrectas (401), no como 500.
- **Lista de intereses:** los seeds usan valores de ejemplo (`futbol`, `running`, `estudio`, `musica`, `cine`, `juegos-de-mesa`) hasta que se defina la lista cerrada ([Intereses del plan](#intereses-del-plan)). Desde S2 esa es la lista inicial de `shared/interests.js` ([Lista de intereses](#lista-de-intereses)).
- **Parámetros del check-in en seeds:** los planes sembrados no tienen `checkInOpensAt/ClosesAt/RadiusMeters` (dependen de [Parámetros del check-in](#parámetros-del-check-in)); agregarlos en S4.
- **`down` conserva colecciones y datos:** las migraciones iniciales crean la colección con su validador; `down` quita índices y validador pero no borra la colección (borrar datos sería irreversible). `migrate:check` verifica que después de `down` no quede ningún índice salvo `_id_`.
- **Validadores más estrictos que 07 (a confirmar):** `users.email` sin mayúsculas ni espacios (garantiza la normalización de la que depende el índice único) y `checkIns` con `additionalProperties: false` (impide guardar la ubicación del participante; el modelo usa `strict: 'throw'`). `participantCount ≤ capacity` se valida con `$expr` junto al `$jsonSchema`. Todos con `validationLevel: 'moderate'`.
- **Backfill de `role`/`status` (ADR-0004):** no se escribió migración de backfill porque no hay entornos con usuarios previos; la colección nace con el validador que exige ambos campos. Si aparece una base vieja, agregar la migración de backfill de [migraciones.md](practicas/migraciones.md).
- **Mongoose 9 depreca `{ new: true }`** en `findOneAndUpdate`: el ejemplo de 07 (patrón de inscripción) debería usar `{ returnDocument: 'after' }`.
- **Idempotencia del chat (`clientId`):** [testing.md](practicas/testing.md) pide que reintentar `chat:send` con el mismo `clientId` cree un solo mensaje, pero `messages` no tiene `clientId` ni índice en 07. Definir antes de S5 (campo + índice único parcial `{ senderId, clientId }` por migración).
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
- **Health que usa la app:** `GET /api/v1/health` (Nginx → `/internal/health`), **no** el `/health` de la raíz. Ese lo contesta Nginx con texto plano y solo dice que Nginx vive; el del back recorre app → Nginx → back → MongoDB/Redis y distingue 200 de 503. Supone que la reescritura genérica `/api/v1/* → /internal/*` lo cubre y que `/internal/health` no exige JWT (Agentes A y C).
- **Cuerpo del 503 del health sin definir:** la app decide "degradado" **por status** (503) y no depende del cuerpo. Si el back manda `{ code, message, requestId }` se muestra; si no, `INTERNAL` + mensaje genérico. El catálogo no tiene un código para "servicio no disponible": ¿agregar `SERVICE_UNAVAILABLE` (503)?
- **Cuarto estado de la pantalla de health:** 05 pide "cargando, vacío, error, con datos"; "vacío" no aplica a un health, así que se usa **degradado** (503) como cuarto estado.
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
Solo existe una vista mínima para otros usuarios (`serializePublic`: `id`, `name`, `photoUrl`). Qué más se muestra del creador o de los inscriptos (edad, barrio, universidad, reputación) se decide en S3–S4. `birthDate`, `age`, `neighborhood` y `city` quedan solo para el dueño hasta entonces.

### Decisiones de implementación a confirmar
- **Logout sin body.** El informe/06 decía `POST /auth/logout` con `refreshToken` en el body (❓). Se resolvió con `sid` dentro del access token: `logout` y `logout-all` solo necesitan el `Authorization`. Consecuencia: si el access venció, la app lo refresca primero (lo hace el cliente HTTP solo).
- **`login` devuelve también `user`** (además de los tokens, que era lo documentado) y los perfiles incluyen `profileComplete` (derivado). Cambios compatibles.
- **"Sesión más antigua" = por `createdAt`.** Al abrir la sexta sesión se revoca la creada primero, aunque se use todos los días. Alternativa: la menos usada (`lastUsedAt`), que no expulsa al teléfono principal.
- **Zona horaria de "hoy": `America/Montevideo`** para validar `birthDate` (no futura, 16–100 años) y calcular `age`. En UTC la edad subiría 3 horas antes del cumpleaños. Si la app sale de Uruguay, hay que parametrizarla. Quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos.
- **`PUT /users/me` es parcial** y exige al menos un campo. Largo máximo de `name`: 80 (no estaba definido).
- **No se puede dejar vacío** un campo de universidad, carrera, ciudad o barrio ya elegido (solo cambiarlo por otro, incluida "Otra"); la carrera y el barrio sí se quitan solos cuando cambia la universidad o la ciudad. Propuesta: aceptar `null` para quitarlos.
- ✅ **Resuelto en S2b:** el registro pide solo nombre, email y contraseña; el resto se completa en el onboarding o en el Perfil.
- **`planId` en `POST /uploads/presign`** se rechaza (400) hasta que exista el módulo de planes (S3); ahí se agrega la comprobación de creador.
- **Enrutado estricto** en toda la API (`case sensitive routing` + `strict routing`): `/internal/health/` y `/auth/LOGIN` dan 404. Es defensa en profundidad del límite de Nginx. **El equipo de AWS debe confirmar que el health check del ALB usa `/internal/health` sin barra final y con esa capitalización.**
- **Zod con mensajes en español** (`z.config(z.locales.es())` en `shared/validation.js`) y los campos desconocidos se informan en `details` con el nombre del campo.
- **`sanitizeFilter` de Mongoose** (mencionado en 09 como red adicional) **no se activó**: reescribe los operadores (`$gt`, `$in`) de nuestras propias queries salvo que se marquen como confiables. La barrera sigue siendo Zod `.strict()` + queries armadas en el repositorio. Decidir si se activa y se marcan las queries propias.
- **Parámetros de Argon2id:** el mínimo de OWASP (19 MiB, 2 pasadas, 1 hilo). Subirlos no requiere migrar (cada hash guarda los suyos); medir en la instancia de AWS.

### Límites conocidos
- **Access token tras el logout:** sigue valiendo hasta 15 minutos (`authenticate` no mira la sesión). Alternativa: consultar la sesión en cada request (una lectura más).
- **Refresh concurrente:** dos refresh simultáneos con el mismo token se tratan como reuso y cierran la sesión. La app hace un solo refresh en vuelo; el riesgo que queda es que la app se cierre entre que el servidor rota el token y que la app lo guarda en SecureStore (la próxima vez pedirá iniciar sesión).
- **Sesiones:** `deviceLabel` es solo una etiqueta (`android`/`ios`); no hay endpoint para listar o cerrar una sesión puntual desde otro dispositivo.
- **Suspender un usuario** (S6, `PATCH /admin/users/:id`) debe llamar a `authService.revokeAllSessions(userId)`; hoy login y refresh ya cierran sus sesiones, pero un access token vigente sigue valiendo hasta 15 minutos.

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
