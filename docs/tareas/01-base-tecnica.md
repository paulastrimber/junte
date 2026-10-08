# Sprint 1 · Base técnica

**Objetivo:** que cualquier persona del equipo clone el repo, corra `task up` y tenga todo funcionando localmente; que la topología AWS exista y responda `/health` por HTTPS.

**Entregable:** estructura de los tres servicios, entorno local con docker-compose, modelos y migraciones de las siete colecciones, CI, topología multi-AZ con health checks de ambos ALB y acceso externo solo por HTTPS.

**Decidir antes:** [Redis](../pendientes.md#redis).

## Repositorio y entorno local

- [ ] **S1-INF-01 · Monorepo y convenciones.** Carpetas `mobile/`, `front-service/`, `back-service/`, `infra/`, `docs/`; `.gitignore`, `.editorconfig`, `.nvmrc`, plantilla de PR.
  *Acepta:* el árbol coincide con [01-vista-general.md](../arquitectura/01-vista-general.md#repositorio).
- [ ] **S1-INF-02 · docker-compose de desarrollo** (`infra/docker-compose.dev.yml`): MongoDB replica set de 1 nodo (con `rs.initiate` automático), Redis, back con recarga, Nginx con la config real.
  *Acepta:* `task up` levanta todo; `curl localhost:8080/health` → 200; `curl localhost:8080/api/v1/...` llega al back como `/internal/...`.
- [ ] **S1-INF-03 · Taskfile** con los comandos de [Taskfile.yml](../../Taskfile.yml) funcionando.
- [ ] **S1-INF-04 · CI** (GitHub Actions): lint, tests back, migraciones up/down/up, tests app, `nginx -t`.
  *Acepta:* un PR con un test roto queda en rojo.

## Back service

- [ ] **S1-BE-01 · Esqueleto Express 5 ESM** con `app.js` / `server.js` / `container.js`, estructura de módulos ([03](../arquitectura/03-back-service.md#estructura-por-módulo-de-dominio)).
- [ ] **S1-BE-02 · Config validada con Zod** + `.env.example`. Lectura de secretos desde Secrets Manager cuando `NODE_ENV=production`.
  *Acepta:* sin `MONGO_URI` el proceso no arranca y dice qué falta.
- [ ] **S1-BE-03 · Middlewares base:** `requestId`, `httpLogger` (pino con `redact`), `notFound`, `errorHandler`, `AppError` + catálogo.
  *Acepta:* test de contrato: ruta inexistente → 404 `{ code: 'NOT_FOUND', message, requestId }`, sin stack.
- [ ] **S1-BE-04 · `GET /internal/health`**: 200 si Mongo y Redis responden, 503 si no.
- [ ] **S1-BE-05 · Modelos Mongoose** de las 7 colecciones según [07](../arquitectura/07-modelo-de-datos.md), incluidos `role` y `status` en `users`. `autoIndex: false`, `autoCreate: false`.
- [ ] **S1-BE-06 · migrate-mongo** configurado (ESM) + migraciones iniciales: una por colección con sus índices, validadores `$jsonSchema` críticos.
  *Acepta:* `task db:migrate` sobre base vacía crea todos los índices de la tabla; `down` los elimina.
- [ ] **S1-BE-07 · `withTransaction`** en `adapters/db` + helper de tests con `MongoMemoryReplSet` que aplica migraciones.
  *Acepta:* test de integración que prueba que una transacción abortada no deja cambios.
- [ ] **S1-BE-08 · ESLint** (neostandard + `import/no-restricted-paths` con las fronteras de [03](../arquitectura/03-back-service.md#reglas-de-dependencia)).
  *Acepta:* importar `mongoose` en un `*.service.js` falla el lint.
- [ ] **S1-BE-09 · Seeds** de desarrollo (usuarios, un admin, planes en Montevideo).

## Front service (Nginx)

- [ ] **S1-NG-01 · Config base** según [04](../arquitectura/04-front-service.md): `/health`, reescritura `/api/v1 → /internal`, `X-Request-Id`, `set_real_ip_from`, rate limiting con 429 JSON, `client_max_body_size`, `resolver` de la VPC, proxy WebSocket.
- [ ] **S1-NG-02 · `tests/smoke.sh`**.
  *Acepta:* en local verifica `/health`, header `X-Request-Id`, 429 tras ráfaga en `/api/v1/auth/login`, y que el rate limit es por IP real (dos IPs distintas en `X-Forwarded-For` desde la red de confianza no se limitan entre sí).

## App

- [ ] **S1-MOB-01 · Proyecto Expo** con estructura de [05](../arquitectura/05-mobile.md#estructura), React Navigation, `eas.json` con perfiles `development`/`preview`/`production`, `EXPO_PUBLIC_API_URL` por perfil.
- [ ] **S1-MOB-02 · Cliente HTTP** (`services/api/client.js`) con mapeo a `ApiError`. Pantalla de prueba que llama a `/health`.
- [ ] **S1-MOB-03 · jest-expo + Testing Library + ESLint** configurados, un test de ejemplo en CI.

## Infraestructura AWS

- [ ] **S1-INF-05 · VPC:** subredes públicas (2 AZ), privadas de borde y aplicación (2 AZ), de datos (3 AZ); IGW; **NAT por AZ**; tablas de rutas; VPC endpoints (S3, Secrets Manager, Logs, SSM).
- [ ] **S1-INF-06 · Security Groups** con la cadena de [02](../arquitectura/02-comunicacion-y-red.md#matriz-de-security-groups).
- [ ] **S1-INF-07 · S3 privado, Secrets Manager, roles IAM** de mínimo privilegio, Redis privado.
- [ ] **S1-INF-08 · MongoDB replica set** de 3 nodos en 3 AZ, autenticación, usuario de la app, migraciones aplicadas.
  *Acepta:* `rs.status()` con 3 miembros; apagar el primario elige otro.
- [ ] **S1-INF-09 · ALB interno** (:3000, health `/internal/health`, **idle 300 s**) + back en 2 AZ.
- [ ] **S1-INF-10 · Nginx en 2 AZ + ALB público** (443, ACM, :8080, **idle 300 s**), DNS.
  *Acepta:* `https://<dominio>/health` → 200; las instancias no tienen IP pública; desde Internet no responden 8080/3000/22.

## Documentación

- [ ] **S1-DOC-01 · Validar con el equipo** los pendientes del sprint 2 y 3 y llevar las correcciones de la [sección A de pendientes](../pendientes.md#a-cambios-a-llevar-al-informe) al informe.
- [ ] **S1-DOC-02 · README** con setup en 5 minutos probado por alguien que no lo escribió.
