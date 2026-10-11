# Sprint 1 · Base técnica

**Objetivo:** que cualquier persona del equipo clone el repo, corra `task up` y tenga todo funcionando localmente; que la topología AWS exista y responda `/health` por HTTPS.

**Entregable:** estructura de los tres servicios, entorno local con docker-compose, modelos y migraciones de las siete colecciones, CI, topología multi-AZ con health checks de ambos ALB y acceso externo solo por HTTPS.

**Decidir antes:** [Redis](../pendientes.md#redis).

## Repositorio y entorno local

- [x] ✅ **S1-INF-01 · Monorepo y convenciones.** Carpetas `mobile/`, `front-service/`, `back-service/`, `infra/`, `docs/`; `.gitignore`, `.editorconfig`, `.nvmrc`, plantilla de PR.
  *Acepta:* el árbol coincide con [01-vista-general.md](../arquitectura/01-vista-general.md#repositorio).
- [x] ✅ **S1-INF-02 · docker-compose de desarrollo** (`infra/docker-compose.dev.yml`): MongoDB replica set de 1 nodo (con `rs.initiate` automático), Redis, back con recarga, Nginx con la config real.
  *Acepta:* `task up` levanta todo; `curl localhost:8080/health` → 200; `curl localhost:8080/api/v1/...` llega al back como `/internal/...`.
- [x] ✅ **S1-INF-03 · Taskfile** con los comandos de [Taskfile.yml](../../Taskfile.yml) funcionando.
- [ ] 🔄 **S1-INF-04 · CI** (GitHub Actions): lint, tests back, migraciones up/down/up, tests app, `nginx -t`.
  *Acepta:* un PR con un test roto queda en rojo.
  *Estado:* `.github/workflows/ci.yml` escrito y sus pasos verificados localmente con `task ci`; falta ver el primer run en GitHub (no se hizo push).

## Back service

- [x] ✅ **S1-BE-01 · Esqueleto Express 5 ESM** con `app.js` / `server.js` / `container.js`, estructura de módulos ([03](../arquitectura/03-back-service.md#estructura-por-módulo-de-dominio)).
- [x] ✅ **S1-BE-02 · Config validada con Zod** + `.env.example`. Lectura de secretos desde Secrets Manager cuando `NODE_ENV=production`.
  *Nota:* la lectura de Secrets Manager quedó como punto de extensión (`resolveSecrets`), ver [pendientes](../pendientes.md#c-notas-del-sprint-1); se completa con S1-INF-07.
  *Acepta:* sin `MONGO_URI` el proceso no arranca y dice qué falta.
- [x] ✅ **S1-BE-03 · Middlewares base:** `requestId`, `httpLogger` (pino con `redact`), `notFound`, `errorHandler`, `AppError` + catálogo.
  *Acepta:* test de contrato: ruta inexistente → 404 `{ code: 'NOT_FOUND', message, requestId }`, sin stack.
- [x] ✅ **S1-BE-04 · `GET /internal/health`**: 200 si Mongo y Redis responden, 503 si no.
- [x] ✅ **S1-BE-05 · Modelos Mongoose** de las 7 colecciones según [07](../arquitectura/07-modelo-de-datos.md), incluidos `role` y `status` en `users`. `autoIndex: false`, `autoCreate: false`.
- [x] ✅ **S1-BE-06 · migrate-mongo** configurado (ESM) + migraciones iniciales: una por colección con sus índices, validadores `$jsonSchema` críticos.
  *Acepta:* `task db:migrate` sobre base vacía crea todos los índices de la tabla; `down` los elimina.
- [x] ✅ **S1-BE-07 · `withTransaction`** en `adapters/db` + helper de tests con `MongoMemoryReplSet` que aplica migraciones.
  *Acepta:* test de integración que prueba que una transacción abortada no deja cambios.
- [x] ✅ **S1-BE-08 · ESLint** (neostandard + `import/no-restricted-paths` con las fronteras de [03](../arquitectura/03-back-service.md#reglas-de-dependencia)).
  *Acepta:* importar `mongoose` en un `*.service.js` falla el lint.
- [x] ✅ **S1-BE-09 · Seeds** de desarrollo (usuarios, un admin, planes en Montevideo).

## Front service (Nginx)

- [x] ✅ **S1-NG-01 · Config base** según [04](../arquitectura/04-front-service.md): `/health`, reescritura `/api/v1 → /internal`, `X-Request-Id`, `set_real_ip_from`, rate limiting con 429 JSON, `client_max_body_size`, `resolver` de la VPC, proxy WebSocket.
- [x] ✅ **S1-NG-02 · `tests/smoke.sh`**.
  *Acepta:* en local verifica `/health`, header `X-Request-Id`, 429 tras ráfaga en `/api/v1/auth/login`, y que el rate limit es por IP real (dos IPs distintas en `X-Forwarded-For` desde la red de confianza no se limitan entre sí).

## App

- [x] ✅ **S1-MOB-01 · Proyecto Expo** con estructura de [05](../arquitectura/05-mobile.md#estructura), React Navigation, `eas.json` con perfiles `development`/`preview`/`production`, `EXPO_PUBLIC_API_URL` por perfil.
- [x] ✅ **S1-MOB-02 · Cliente HTTP** (`services/api/client.js`) con mapeo a `ApiError`. Pantalla de prueba que llama a `/health`.
- [x] ✅ **S1-MOB-03 · jest-expo + Testing Library + ESLint** configurados, un test de ejemplo en CI.

## Infraestructura AWS

⛔ **Traspaso al equipo de AWS.** Fuera del alcance del equipo de la app: lo implementan y cierran las personas que se encargan de AWS (decidido 2026-10-11). Las tareas siguen abiertas en este tablero hasta que ellas las marquen.

**Qué necesitan saber del lado de la app y el back:**

- **Decisiones que les tocan** (propuestas en [pendientes](../pendientes.md)): [Redis](../pendientes.md#redis) (ElastiCache con réplica en la otra AZ), cómo corre el back en EC2 (contenedor con el target `prod` del `Dockerfile` o proceso con systemd) y [TLS interno](../pendientes.md#tls-interno).
- **Secretos:** `src/config/index.js` deja `resolveSecrets(env)` como punto de extensión. Falta elegir entre SDK al arrancar (`@aws-sdk/client-secrets-manager`) o variables inyectadas por user-data/systemd. Hasta entonces `NODE_ENV=production` rechaza `JWT_SECRET` con valores del repo.
- **Variables que el back exige:** `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL`, `JWT_SECRET` (ver `back-service/.env.example`). Desde el Sprint 2 se suman `S3_BUCKET` y `AWS_REGION` (opcionales en desarrollo/test, **obligatorias con `NODE_ENV=production`**; ver `.env.example`). No hay credenciales en el código: usa el rol IAM de la instancia.
- **S3 (lo necesita el Sprint 2 para fotos):** bucket privado con Block Public Access. El rol del back necesita `s3:PutObject` y `s3:GetObject` sobre el bucket (`HeadObject` se autoriza con `GetObject`); las claves llevan prefijo del dueño (`users/<userId>/…`, `plans/<planId>/…`). Sin CORS: la app móvil no es un navegador.
- **Dominios y DNS (S1-INF-10):** cuando existan, reemplazar los `*.invalid` de `mobile/eas.json`. Hasta entonces `app.config.js` aborta los builds de `preview` y `production`.
- **Health checks de los ALB:** público → Nginx `/health`; interno → `/internal/health` en `:3000`. Ambos con idle timeout de 300 s.
- **Verificación pendiente de punta a punta:** el proxy WebSocket de Nginx (upgrade, 300 s) solo se probará con Socket.io en el Sprint 5.

- [ ] ⛔ **S1-INF-05 · VPC:** subredes públicas (2 AZ), privadas de borde y aplicación (2 AZ), de datos (3 AZ); IGW; **NAT por AZ**; tablas de rutas; VPC endpoints (S3, Secrets Manager, Logs, SSM).
- [ ] ⛔ **S1-INF-06 · Security Groups** con la cadena de [02](../arquitectura/02-comunicacion-y-red.md#matriz-de-security-groups).
- [ ] ⛔ **S1-INF-07 · S3 privado, Secrets Manager, roles IAM** de mínimo privilegio, Redis privado.
- [ ] ⛔ **S1-INF-08 · MongoDB replica set** de 3 nodos en 3 AZ, autenticación, usuario de la app, migraciones aplicadas.
  *Acepta:* `rs.status()` con 3 miembros; apagar el primario elige otro.
- [ ] ⛔ **S1-INF-09 · ALB interno** (:3000, health `/internal/health`, **idle 300 s**) + back en 2 AZ.
- [ ] ⛔ **S1-INF-10 · Nginx en 2 AZ + ALB público** (443, ACM, :8080, **idle 300 s**), DNS.
  *Acepta:* `https://<dominio>/health` → 200; las instancias no tienen IP pública; desde Internet no responden 8080/3000/22.

## Documentación

- [ ] **S1-DOC-01 · Validar con el equipo** los pendientes del sprint 2 y 3 y llevar las correcciones de la [sección A de pendientes](../pendientes.md#a-cambios-a-llevar-al-informe) al informe.
- [ ] **S1-DOC-02 · README** con setup en 5 minutos probado por alguien que no lo escribió.
