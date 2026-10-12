# CLAUDE.md

Guía para trabajar en **junte**: app móvil de planes universitarios (crear planes, feed cercano recomendado, inscripción, asistencia por QR + ubicación, chat por plan, push, reportes, panel `/admin`).

La fuente de verdad del diseño es el *Informe de arquitectura técnico* (ya entregado; la etapa actual es construir la app); el detalle vive en [`docs/`](docs/README.md). Este archivo resume **lo que no se puede romper** y dónde buscar lo demás. Los contratos y reglas son una propuesta preliminar: si algo no está definido acá, en `docs/` o en el informe, **preguntar antes de inventarlo** y anotarlo en [`docs/pendientes.md`](docs/pendientes.md).

## Stack

- **Cliente:** React Native (Expo + EAS Build). Solo habla con `/api/v1`; nunca con MongoDB ni AWS directo (salvo S3 con URL firmada).
- **Borde:** Nginx (front service). Proxy, IP real, rate limit, `requestId`, `/admin` estático. Sin lógica de negocio.
- **Aplicación:** Node.js + Express 5 + Socket.io (adaptador Redis), JavaScript ESM, Mongoose, Zod, JWT propio (bcrypt o Argon2 para contraseñas).
- **Datos:** MongoDB replica set (3 nodos / 1 en local; requisito para transacciones). Migraciones con migrate-mongo.
- **AWS:** ALB público → Nginx → ALB interno → Express; S3 privado, Secrets Manager, CloudWatch, Session Manager, NAT por AZ. **FCM** para push.
- **Fuera de alcance:** Lambda, API Gateway, DynamoDB, Kubernetes, Cognito.

## Dónde está cada cosa

| Necesito… | Leer |
|-----------|------|
| Capas y nombres | [docs/arquitectura/01-vista-general.md](docs/arquitectura/01-vista-general.md) |
| Estructura del back, MVC, DI | [03-back-service.md](docs/arquitectura/03-back-service.md) |
| Estructura de la app | [05-mobile.md](docs/arquitectura/05-mobile.md) |
| Endpoints y errores | [06-api.md](docs/arquitectura/06-api.md), [errores-y-logs.md](docs/practicas/errores-y-logs.md) |
| Colecciones e índices | [07-modelo-de-datos.md](docs/arquitectura/07-modelo-de-datos.md) |
| Qué tarea toca | [docs/tareas/](docs/tareas/README.md) |
| Cómo testear | [testing.md](docs/practicas/testing.md) |

## Estructura

```
mobile/          app.config.js, eas.json, src/{screens,components,hooks,services,contexts,navigation,config,utils}/
                 screens → hooks → services   (una screen nunca llama a la API directo)
front-service/   nginx.conf, conf.d/, templates/ (valores por entorno vía NGINX_*), snippets/, admin/, tests/smoke.sh
back-service/
  src/{app,server,container}.js           app sin listen · arranque · composition root (DI)
  src/modules/<modulo>/   *.routes · *.controller · *.service · *.repository · *.model · *.validators · *.serializer · index.js
  src/{middlewares,sockets,adapters,config,shared}/   adapters/db = connectDb, pingDb, withTransaction
  migrations/  seeds/  scripts/  tests/{integration,contract,helpers}/
infra/           docker-compose.dev.yml (+ back/, mongo/) y CloudFormation de AWS: templates/, parameters/ (por entorno)
prompts/         registro de prompts (ver abajo)
```

## Registro de prompts

**Cada prompt que se le haga a Claude en este repo se registra en `prompts/`**, antes de empezar a trabajar en él. Un archivo por prompt:

- Nombre: `prompts/YYYY-MM-DD-HHMM-<slug>.md` (hora local, slug corto en kebab-case).
- Contenido: título, autor y fecha, y el prompt **textual** (sin resumir ni corregir).
- Autor: el usuario de GitHub de quien hace el prompt, obtenido con `gh api user --jq .login`. Si `gh` no está disponible, preguntar en lugar de adivinarlo.

```markdown
# <Título corto>

- **Autor:** @<usuario-github>
- **Fecha:** <ISO 8601 con zona horaria>

## Prompt

<prompt textual>
```

Flujo: `ruta → middlewares → controlador → servicio → repositorio/modelo → MongoDB`.
- Controlador: adapta HTTP, sin negocio, no importa modelos.
- Servicio: todo el negocio; factory con dependencias inyectadas; **no importa `express` ni `mongoose`**.
- Serializer: la "vista"; nunca expone hashes.
- Entre módulos solo se importa desde `index.js`.

## Reglas que no se rompen

1. **Identidad desde el token, nunca desde el body** (`creatorId`, `senderId`, `userId`, `reporterId`).
2. **Campos solo-backend** (`reputation`, `role`, `status` de usuario, `age` —se calcula desde `birthDate`—, `photoKey`, `noShow`, `noShowAt`, `participantCount`, `university` del plan, `qrNonceHash`): Zod `.strict()` los rechaza.
3. **Cupos:** `participantCount` y `planParticipants` se modifican **en la misma transacción**, con actualización condicional. Nunca "consultar y después insertar".
   - Crear un plan no consume cupo; el creador debe inscribirse si quiere participar.
   - `PATCH /plans/:id` con `capacity` menor a los inscriptos → 409.
   - `capacity: null` es **cupo ilimitado**: el plan nunca está lleno y la condición de inscripción tiene que dejarlo pasar. "Lleno" se calcula (`participantCount >= capacity`), no es un `status`.
4. **Check-in:** inscripción activa + ventana (`checkInOpensAt`/`checkInClosesAt`) + QR + distancia ≤ `checkInRadiusMeters`. El QR es un desafío aleatorio con vencimiento (se guarda `qrNonceHash`), no el ID del plan. **No persistir la ubicación** del participante: solo `distanceMeters` y `accuracyMeters`. Check-in y `reputation +1` en una transacción.
   - Excepción: el creador inscripto hace check-in sin QR (solo ubicación) y no suma en ese momento; recibe el +1 al cerrar la asistencia, solo si al menos 2 participantes más hicieron check-in.
5. **Reputación:** +1 por check-in válido; `noShow` no resta. El job de cierre de asistencia marca `noShow=true` en las inscripciones activas sin check-in cuando cierra la ventana de check-in, una sola vez por plan. Pasar un plan a `closed` no marca `noShow`; los planes `cancelled` no se procesan.
6. **Chat:** solo participante activo o creador. Socket.io autentica la conexión y verifica pertenencia al plan; REST de mensajes para historial y fallback por polling. Texto de 1 a 2000 caracteres.
7. **Permisos en el servicio:** perfil e inscripciones propias; solo el creador edita el plan y genera QR; reportes nunca visibles a otros; `/admin/*` requiere `role: 'admin'`.
8. **Nunca** pasar filtros u operadores del cliente a MongoDB; las queries se construyen en el backend.
9. **Índices y cambios de datos solo por migración** (`up` + `down`; una migración mergeada no se edita). Mongoose con `autoIndex: false`.
10. **Efectos secundarios (push, avisos) después del commit**, nunca dentro de la transacción.
11. **Back sin estado local**: hay 2+ instancias. Jobs con lock en Redis.
12. **Secretos** solo en Secrets Manager / `.env` local (mantener `.env.example` con nombres, sin valores). Nada en Git, logs, binario móvil ni `EXPO_PUBLIC_*`. Única excepción: la clave de Google Maps para Android, que queda en el APK y por eso va restringida a la app ([09-seguridad.md](docs/arquitectura/09-seguridad.md#secretos)).
13. **Logs** con `requestId`, estado y duración; sin contraseñas, tokens, coordenadas exactas ni bodies completos.
14. Errores siempre `{ code, message, requestId }` con `code` del catálogo.

## Convenciones de la API

- Prefijo `/api/v1` (Nginx → `/internal` en Express). JSON, ISO 8601 con zona, IDs string, **campos en inglés**, GeoJSON `[lng, lat]`.
- Paginación: `limit` (20, máx 100) + `cursor` opaco → `{ items, nextCursor }` (`null` al final).
- Todas las rutas de negocio requieren `Authorization: Bearer <access_token>`. Públicas: `/auth/register`, `/auth/login`, `/auth/refresh` y `GET /health` (sin prefijo, 200/503).
- Códigos: 400 validación, 401 token ausente/inválido/vencido, 403 sin permiso, 404 inexistente, 409 conflicto (cupo, duplicado, estado), 429 rate limit, 500 sin detalles sensibles.
- Endpoints: `auth/*` (`register`, `login`, `refresh`, `logout`, `logout-all`), `users/me` (+ `/photo`), `catalogs`, `plans` (GET/POST), `plans/filters`, `feed` (POST), `plans/:id` (GET/PATCH), `plans/:id/join` (POST/DELETE), `plans/:id/qr`, `plans/:id/check-in`, `plans/:id/messages` (GET/POST), `plans/:id/photo`, `reports`, `uploads/presign`. Parámetros y permisos en [06-api.md](docs/arquitectura/06-api.md).

## Modelo de datos

Colecciones: `users`, `sessions`, `plans`, `planParticipants`, `checkIns`, `messages`, `reports`, `deviceTokens` y los catálogos editables por el admin (`interestCategories`, `interests`, `universities`, `careers`, `cities`, `neighborhoods`; ADR-0009). Todas con `createdAt`/`updatedAt`, referencias por `ObjectId`. Detalle en [07-modelo-de-datos.md](docs/arquitectura/07-modelo-de-datos.md).

Índices obligatorios:
- `users.email` único
- `sessions`: `{ sid }` único, `{ userId }` y TTL sobre `expiresAt` (una sesión por dispositivo; máx. 5 activas por usuario)
- catálogos: `key` único (`careers`: `{ universityKey, key }`; `neighborhoods`: `{ cityKey, key }`)
- `plans`: `{ status, startsAt }` y `2dsphere` en `location`
- `planParticipants` único en `{ planId, userId }` (un registro por par, reactivable)
- `checkIns` único en `{ planId, userId }`
- `messages`: `{ planId, createdAt, _id }`
- `reports`: `{ status, createdAt }`
- `deviceTokens.token` único

**Perfil y catálogos:** universidad, carrera, ciudad, barrio e intereses son **keys** de los catálogos (`um`, `padel`…), nunca texto libre; "Otra" es la key reservada `other`, sin texto. La carrera cuelga de la universidad y el barrio de la ciudad; los intereses pueden llevar `minAge`. Se validan en el servicio contra la base (reglas en `catalogs/catalog.rules.js`) y los datos iniciales se cargan con `back-service/catalogs/` (ver ADR-0009). El registro pide solo nombre, email y contraseña; el resto se completa en el onboarding (todo salteable).

## Feed de recomendación

Candidatos con `$geoNear` dentro de `radiusKm` (0.5 a 50, por defecto 10; hasta 200), luego:

```
score = 0.5 * Jaccard(intereses usuario, intereses plan)
      + 0.3 * P(d)      // 1 en distancia 0, lineal hasta 0 en radiusKm
      + 0.2 * H(u, p)   // 1 sin superposición de calendario, 0 con superposición, 0.5 sin permiso
```

Los pesos deben ser configurables sin cambiar el contrato de la API (`FEED_WEIGHTS`, JSON).

- `POST /feed` recibe la posición y, si hay permiso, las franjas ocupadas del calendario **por body** (nunca por query; no se persisten ni se loguean). `GET /plans?near=` usa el mismo ranking sin calendario. Los planes en los que el usuario ya está inscripto cuentan como ocupados. Ver ADR-0010.
- Paginación por posición en el ranking (cursor opaco con el instante de la primera página). Sin `near`, `GET /plans` va por fecha.
- **Filtros predefinidos** (regla 8): fecha, intereses, rangos de precio (definidos solo en `plans/plan.rules.js`, la app los lee de `GET /plans/filters`) y cupo (`availability=available|full`; los llenos van en una sección aparte).
- Plan: `endsAt` obligatorio (posterior a `startsAt`, hasta 7 días), `location.label` obligatorio, `price` en pesos (0 = gratis), `interests` de 1 a 10 keys del catálogo.

## Seguridad

- Zod en todo input: enteros positivos, fechas coherentes, IDs válidos, longitudes máximas, coordenadas en rango.
- JWT: verificar firma, algoritmo esperado, vencimiento, tipo de token y usuario activo. Access token de vida corta; refresh token rotado por sesión y revocable (una sesión por dispositivo en `sessions`, que guarda solo el hash del refresh; ver ADR-0008).
- Fotos: bucket S3 privado, URLs firmadas de corta duración; verificar tipo, tamaño, contenido y dueño antes de vincular `photoKey`. MongoDB guarda la clave, no la imagen.
- Móvil: tokens en almacenamiento seguro del SO (`expo-secure-store`), nunca en logs.

## Red y despliegue

- App → ALB: HTTPS/WSS 443 (TLS termina en el ALB). Backend → MongoDB: TCP 27017.
- Security Groups mínimos por capa (cada uno acepta solo desde la capa anterior). Sin IP pública en las EC2, sin puerto 22: administración por Session Manager.
- Salida del backend vía NAT (dependencias, FCM) y/o VPC endpoints.
- Móvil: perfiles EAS separados (development, preview, production); URLs de API/Socket.io por entorno. Push se prueba con development build (Expo Go no las soporta). Entrega académica: APK de Android.

## Comandos

```
task setup        # dependencias + .env
task up           # entorno local (Nginx, back, Mongo RS, Redis)
task db:migrate   # migraciones
task db:catalogs:sync # suma a la base entradas nuevas de back-service/catalogs/ (solo inserta)
task db:seed      # datos de desarrollo (usa SEED_PASSWORD de back-service/.env; `task setup` la genera)
task ci           # lint + tests + migraciones + nginx -t (antes de cada PR)
task front:smoke  # smoke test de Nginx contra el entorno local
task --list       # todo lo demás
```

Requisitos: Node 22 (`.nvmrc`, ≥ 22.12), Docker con Compose v2, [Task](https://taskfile.dev). Los tests del back usan `mongodb-memory-server` con MongoDB 9.0.2 (la misma versión que el compose).

## Tests

Tests primero para reglas de negocio. Prioridad: validaciones, propiedad del plan (403 sobre plan ajeno), token vencido (401), inscripciones concurrentes que no superen el cupo ni dupliquen, QR vencido / inscripción inactiva / fuera de radio que impidan el check-in, y contratos HTTP. Casos obligatorios en [testing.md](docs/practicas/testing.md#qué-se-testea-sí-o-sí).

## Plan de sprints (1 semana c/u)

1. Base técnica: estructura, modelos e índices, infraestructura AWS, `/health` por HTTPS.
2. Auth y perfiles: registro/login/refresh, middleware JWT, pantallas, fotos en S3.
3. Planes y feed por cercanía: CRUD, `$near`, paginación, recomendación, calendario, filtros, costo y cupo ilimitado.
4. Inscripciones, asistencia y reputación: transacciones de cupo (también con cupo ilimitado), QR, check-in, `noShow`, pedido de aviso de cupo liberado (`spotAlerts`).
5. Chat y notificaciones: Socket.io, fallback REST, notas de voz, FCM y `deviceTokens`, envío del aviso de cupo liberado.
6. Admin y comportamiento móvil: `/admin`, offline + sincronización, CloudWatch, backups.
7. Validación y entrega: e2e, seguridad, concurrencia, restauración, APK.

## Al escribir código

- Leer la tarea en `docs/tareas/` y sus criterios de aceptación.
- Cambio de contrato o modelo → actualizar `docs/` en el mismo PR.
- Commits Conventional Commits en inglés; docs y mensajes al usuario en español.
