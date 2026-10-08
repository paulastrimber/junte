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

### infra local + Nginx (Agente C)
- **Imágenes fijadas** (verificadas en Docker Hub el 07/10/2026): `mongo:9.0.2-noble` (última estable; el driver `mongodb@7.7` de Mongoose 9 soporta hasta 9.0), `redis:8.10.2-alpine`, `nginx:1.30.5-alpine` (rama stable), `node:22.23.3-trixie-slim` (back).
- **Versión de MongoDB en tests:** `mongodb-memory-server@11.3` usa 8.2.6 por defecto. Propuesta: fijar `MONGOMS_VERSION=9.0.2` en los tests (Agente B) y usar 9.0 también en AWS (S1-INF-08).
- **`npm run dev` se cae sin `.env`:** en Node 22.23, `node --watch --env-file-if-exists=.env` intenta vigilar `.env` y termina con `ENOENT` si no existe (también con `--watch-path`). Con `task setup` no pasa porque crea `.env`. En compose el back corre `node --watch src/server.js` (las variables las inyecta compose). Decidir si se cambia el script de `package.json`.
- **`JWT_SECRET` de desarrollo:** para que `docker compose up` funcione sin `.env`, `infra/back/dev-entrypoint.sh` exporta uno fijo e inseguro **solo si** viene vacío, con un aviso en el log. Nunca aplica fuera del compose de desarrollo.
- **`X-Request-Id`:** cambió respecto del borrador de 04 ("pisa cualquiera"): ahora se respeta el del cliente si cumple `[A-Za-z0-9._:-]{1,128}`; si no, lo genera Nginx. El middleware `requestId` del back (Agente A) debería tomar el header tal cual.
- **IP del cliente en el back:** Nginx manda `X-Real-IP` y `X-Forwarded-For`. Si el back usa `req.ip`, configurar `trust proxy` de Express acorde (Agente A).
- **413 y 502/503/504 no son JSON:** Nginx devuelve sus páginas HTML (sin versión, `server_tokens off`) porque el catálogo no tiene códigos para eso. Propuesta: agregar `PAYLOAD_TOO_LARGE` (413) y `SERVICE_UNAVAILABLE` (502/503/504) al catálogo y responderlos con `error_page` en Nginx.
- **Error log y query strings:** el access log no guarda query strings, pero el error log de Nginx (p. ej. un `connect() failed` al back) incluye la línea del request completa. Con `GET /plans?lat=…&lng=…` eso son coordenadas. Refuerza la propuesta de `POST /feed` (B · Compatibilidad horaria) o hay que bajar el nivel del error log en producción.
- **Zona `auth` (10 r/min por IP) en todo `/api/v1/auth/`:** en una universidad muchos estudiantes salen por la misma IP pública (NAT), así que el login y el refresh podrían dar 429 en horas pico. Propuesta: zona estricta solo para `login`/`register`, `refresh` con la zona `api`, y calibrar con datos reales.
- **Dockerfile `prod`:** `back-service/Dockerfile` tiene un target `prod` como propuesta. 10-despliegue no define cómo corre el back en EC2 (contenedor o proceso con systemd); decidirlo en S1-INF-09.
- **WebSocket sin verificar de punta a punta:** el proxy de `/api/v1/socket.io/` está configurado (upgrade, 300 s), pero el back todavía no tiene Socket.io. Agregar la verificación a `smoke.sh` en S5.
- **CI (`nginx -t`):** usar `docker compose -f infra/docker-compose.dev.yml run --rm --no-deps nginx nginx -t`, que renderiza los templates con las variables del compose. Con la imagen sola habría que replicar montajes y variables `NGINX_*`.
- **Subred fija de compose (`172.30.0.0/24`):** necesaria para declarar la red de confianza. Si choca con otra red local, cambiarla en el compose junto con `NGINX_TRUSTED_CIDR`.

### mobile (Agente D)
