# Sprint 1 · Base técnica (sin AWS) con subagentes

- **Autor:** @phillipbowles
- **Fecha:** 2026-10-07T21:21:29-03:00

## Prompt

Vas a implementar el Sprint 1 (base técnica) de junte, **sin la infraestructura AWS** (S1-INF-05 a S1-INF-10 quedan fuera).
Sos el **líder**: preparás la base, lanzás 4 subagentes en paralelo con isolation "worktree", integrás sus ramas y verificás.
No leas código ni documentos que no necesites: tu contexto es para coordinar.

## Contexto (leé solo esto)
- `CLAUDE.md`
- `docs/README.md`
- `docs/tareas/README.md`
- `docs/tareas/01-base-tecnica.md`
- `docs/arquitectura/03-back-service.md` (estructura y reglas de dependencia)

Reglas generales:
- Si algo no está definido en `docs/`, no lo inventes: anotalo en `docs/pendientes.md` y seguí con lo demás.
- Registrá este prompt en `prompts/` siguiendo la convención existente.
- Antes de fijar versiones de dependencias, verificá en npm las versiones estables actuales. No asumas.
- Verificalo especialmente para Express 5, Mongoose, migrate-mongo (soporte ESM), neostandard, Vitest, mongodb-memory-server, Socket.io y el SDK de Expo.

## Fase 0 · Vos, secuencial, en una rama `feat/S1-base-tecnica`

1. **Reestructurar el back.** Hoy `back-service/` es plano. Pasalo a la estructura de `03-back-service.md`:
   - `src/{app,server,container}.js`
   - `src/{config,modules,middlewares,sockets,adapters,shared}/`
   - `migrations/`, `seeds/`, `tests/{integration,contract,helpers}/`
   - Conservá el `/health` actual funcionando mientras tanto.
2. **Alinear el móvil con `05-mobile.md`.** Mové las carpetas vacías a `mobile/src/...`.
3. **Instalar de una vez todas las dependencias del back.** Así los agentes no se pisan en `package.json` ni en el lockfile:
   - Dependencias de runtime: express, mongoose, zod, pino, pino-http, ioredis, socket.io, @socket.io/redis-adapter, migrate-mongo.
   - Dependencias de desarrollo: vitest, supertest, mongodb-memory-server, eslint, neostandard, eslint-plugin-import.
   - Dejá definidos los scripts `dev`, `test`, `test:watch`, `lint`, `migrate:check`, `seed`.
   - Si alguna dependencia no tiene soporte ESM o no existe como se espera, anotalo y elegí la alternativa documentada.
4. **Escribir los contratos compartidos como stubs con JSDoc.** Los agentes se coordinan a través de estas firmas, no de implementaciones:
   - `src/adapters/db/index.js`, del Agente B: `connectDb(uri)`, `disconnectDb()`, `pingDb()`, `withTransaction(fn)`.
   - `src/adapters/redis.js`, del Agente A: `connectRedis(url)`, `pingRedis()`, `disconnectRedis()`.
   - `src/shared/errors.js`, del Agente A: `AppError` y el catálogo de `docs/practicas/errores-y-logs.md`.
   - `back-service/.env.example`, la lista definitiva de variables: `NODE_ENV`, `PORT`, `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL`, `JWT_SECRET`, `LOG_LEVEL`, `FEED_WEIGHTS`. Agregá otras solo si son necesarias.
   - Nombres de servicios y puertos del docker-compose:
     - `nginx` en 8080
     - `back` en 3000
     - `mongo` en 27017, como replica set `rs0`
     - `redis` en 6379
   - Nginx reescribe `/api/v1/*` a `/internal/*`. Express monta las rutas bajo `/internal`.
5. Commit: `chore(back): restructure into modules and shared contracts`.

## Fase 1 · 4 subagentes en paralelo
Lanzalos en un solo mensaje, cada uno con `isolation: "worktree"` y su propia rama.

Cada agente recibe en su prompt:
- La lista de sus tareas y las carpetas que son **suyas**. No toca nada fuera de ellas; si necesita algo de otra parte, lo deja anotado.
- La instrucción de leer solo `CLAUDE.md`, el archivo de su sprint y los docs indicados.
- La Definición de hecho de `docs/flujo/definicion-de-hecho.md`.
- Commits por tarea en Conventional Commits, en inglés, con el ID de tarea en el cuerpo.
- **Respuesta final de 15 líneas como máximo**:
  - rama
  - archivos principales
  - tareas completas e incompletas
  - estado de tests y lint
  - decisiones tomadas
  - dudas o cosas anotadas en `pendientes.md`
  - Sin pegar código.

**Agente A · back-core.** Tareas S1-BE-01, 02, 03, 04 y 08.
- Docs: `03-back-service.md`, `errores-y-logs.md`, `estilo-de-codigo.md`.
- Es dueño de:
  - `src/app.js`, `src/server.js`, `src/container.js`
  - `src/config/`, `src/middlewares/`, `src/shared/`
  - `src/adapters/redis.js`, `src/adapters/logger.js`
  - `tests/contract/`
  - `eslint.config.js`
- Lo que tiene que quedar:
  - config validada con Zod: si falta una variable, el proceso no arranca;
  - middlewares `requestId`, httpLogger con `redact`, `notFound` y `errorHandler`;
  - `GET /internal/health` que responde 200 o 503 usando `pingDb` y `pingRedis`;
  - ESLint con `import/no-restricted-paths` aplicando las fronteras de `03`;
  - tests de contrato: un 404 tiene la forma `{code,message,requestId}` sin stack; health en 200 y en 503 con los adapters falsos.

**Agente B · back-data.** Tareas S1-BE-05, 06, 07 y 09.
- Docs: `07-modelo-de-datos.md`, `migraciones.md`, `testing.md`, ADR-0002 y ADR-0004.
- Es dueño de:
  - `src/modules/*/*.model.js`
  - `src/adapters/db/`
  - `migrations/`, `seeds/`
  - `tests/helpers/`, `tests/integration/`
  - `migrate-mongo-config.js`
- Lo que tiene que quedar:
  - los 7 modelos con `role` y `status`, `autoIndex` y `autoCreate` en false;
  - una migración por colección con los índices de la tabla de `07` y validadores `$jsonSchema` para los invariantes críticos;
  - `withTransaction`;
  - helper de tests con `MongoMemoryReplSet` que aplica las migraciones;
  - test de integración: una transacción abortada no deja cambios y el índice único rechaza el duplicado;
  - `up → down → up` limpio;
  - seeds con un admin y planes en Montevideo `[lng, lat]`.

**Agente C · infra local + Nginx.** Tareas S1-INF-02 y S1-NG-01, 02.
- Docs: `04-front-service.md`, `02-comunicacion-y-red.md`.
- Es dueño de `infra/`, `front-service/` y `back-service/Dockerfile`.
- Lo que tiene que quedar:
  - `infra/docker-compose.dev.yml` con:
    - `mongo` como replica set de 1 nodo, con `rs.initiate` automático e idempotente;
    - `redis`;
    - `back` con recarga en caliente y healthcheck;
    - `nginx` con la configuración real.
  - Configuración de Nginx:
    - real IP con la red de docker como red de confianza;
    - rate limit con respuesta 429 en JSON;
    - `X-Request-Id`;
    - rewrite y proxy WebSocket;
    - `client_max_body_size`;
    - `resolver`.
  - Para desarrollo, el resolver puede apuntar al DNS de docker (`127.0.0.11`). Dejá documentado el de la VPC para AWS.
  - `front-service/tests/smoke.sh` verifica: `/health`, el header `X-Request-Id`, 429 ante una ráfaga en `/api/v1/auth/login`, y que `/api/v1/x` llega al back como `/internal/x`.
  - Puede usar un `/internal/health` mínimo del back si el Agente A todavía no terminó.

**Agente D · mobile.** Tareas S1-MOB-01, 02 y 03.
- Docs: `05-mobile.md`, `estilo-de-codigo.md`.
- Es dueño de `mobile/` y de nada más.
- Lo que tiene que quedar:
  - proyecto Expo en JavaScript dentro de `mobile/` con la estructura `src/` de `05`;
  - React Navigation;
  - `eas.json` con los perfiles `development`, `preview` y `production`, este último con `android.buildType: 'apk'`;
  - `app.config.js` que lee `EXPO_PUBLIC_API_URL`;
  - `services/api/client.js` con axios y mapeo a `ApiError {status, code, message, requestId}`;
  - una pantalla de prueba que llama a `/health` y muestra los 4 estados;
  - jest-expo, Testing Library y ESLint neostandard;
  - tests del cliente HTTP que verifican el mapeo de errores.
- Todavía no implementa auth ni refresh: eso es del sprint 2.

## Fase 2 · Vos, integración

1. Mergeá las 4 ramas en `feat/S1-base-tecnica`. Resolvé conflictos respetando a qué agente pertenece cada carpeta.
2. **S1-INF-03.** Ajustá `Taskfile.yml` a lo que realmente existe. Todos los comandos tienen que funcionar.
3. **S1-INF-04.** Creá `.github/workflows/ci.yml` con estos pasos: lint del back y del móvil, tests del back, `migrate:check`, tests del móvil y `nginx -t`.
4. **Agregá `.nvmrc`, `.editorconfig` y `.github/pull_request_template.md`** (la plantilla está en `flujo-de-trabajo.md`).
5. **Verificación end-to-end** desde cero:
   - `task setup && task up && task db:migrate && task db:seed && task front:smoke && task ci`.
   - Si algo falla, arreglalo o delegá el arreglo al agente dueño con `SendMessage`, en lugar de abrir un agente nuevo.
6. **Actualizá documentación.** Marcá las tareas hechas en `docs/tareas/01-base-tecnica.md` y en el tablero. Corregí cualquier doc que haya quedado desfasado del código, por ejemplo la estructura del back en `CLAUDE.md`.
7. **No hagas push ni abras un PR sin preguntarme.**

## Al terminar, respondeme con:
- qué tareas quedaron hechas y cuáles no, y por qué;
- la salida resumida de `task ci` y de `task front:smoke`;
- las decisiones que tomaste y lo nuevo que agregaste a `pendientes.md`;
- el próximo paso sugerido. Probablemente sea el prompt de AWS (S1-INF-05..10) o el sprint 2.
