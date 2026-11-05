# Sprint 1 · Base técnica

**Objetivo:** que cualquier persona del equipo clone el repo, corra `task up` y tenga todo funcionando localmente; que la topología AWS exista y responda `/health` por HTTPS.

**Entregable:** estructura de los tres servicios, entorno local con docker-compose, modelos y migraciones de las siete colecciones, CI, topología multi-AZ con health checks de ambos ALB y acceso externo solo por HTTPS.

**Decidir antes:** [Redis](../pendientes.md#redis).

**✅ Cerrado en dev (2026-10-28, decidido por Paula).** El objetivo se cumple: entorno local completo y la API respondiendo `/health` por HTTPS en `https://api.dev.junteapp.me` con los dos ALB sanos ([evidencia](../evidencia/s1-paso-1.9-dns-front.md)). Quedan abiertas, a propósito:
- **S1-INF-08** (3 nodos de MongoDB) quedó cerrada en dev el 2026-11-01: dev pasó a 3 nodos de forma permanente. **S1-INF-09** (back en 2 AZ) sigue con una instancia en dev para cuidar el crédito y se cierra en la cuenta B con **S7-QA-06** ([07](07-validacion-y-entrega.md)).
- **S1-DOC-01 y S1-DOC-02**, a cargo del equipo: validar los pendientes y que alguien que no escribió el README haga el setup.

## Repositorio y entorno local

- [x] ✅ **S1-INF-01 · Monorepo y convenciones.** Carpetas `mobile/`, `front-service/`, `back-service/`, `infra/`, `docs/`; `.gitignore`, `.editorconfig`, `.nvmrc`, plantilla de PR.
  *Acepta:* el árbol coincide con [01-vista-general.md](../arquitectura/01-vista-general.md#repositorio).
- [x] ✅ **S1-INF-02 · docker-compose de desarrollo** (`infra/docker-compose.dev.yml`): MongoDB replica set de 1 nodo (con `rs.initiate` automático), Redis, back con recarga, Nginx con la config real.
  *Acepta:* `task up` levanta todo; `curl localhost:8080/health` → 200; `curl localhost:8080/api/v1/...` llega al back como `/internal/...`.
- [x] ✅ **S1-INF-03 · Taskfile** con los comandos de [Taskfile.yml](../../Taskfile.yml) funcionando.
- [x] ✅ **S1-INF-04 · CI** (GitHub Actions): lint, tests back, migraciones up/down/up, tests app, `nginx -t`; desde el 2026-10-21 también `cfn-lint` de `infra/templates/` y `shellcheck` de los scripts de AWS.
  *Acepta:* un PR con un test roto queda en rojo.
  *Estado:* corre en cada PR y en `main`. Quedó en rojo del 15 al 19/10 por dos tests del chat con fecha fija, hasta el arreglo del #14.

## Back service

- [x] ✅ **S1-BE-01 · Esqueleto Express 5 ESM** con `app.js` / `server.js` / `container.js`, estructura de módulos ([03](../arquitectura/03-back-service.md#estructura-por-módulo-de-dominio)).
- [x] ✅ **S1-BE-02 · Config validada con Zod** + `.env.example`. Lectura de secretos desde Secrets Manager cuando `NODE_ENV=production`.
  *Nota:* la lectura de Secrets Manager quedó como punto de extensión (`resolveSecrets`), ver [pendientes](../pendientes.md#c-notas-del-sprint-1); se completa con S1-INF-07.
  *Acepta:* sin `MONGO_URI` el proceso no arranca y dice qué falta.
- [x] ✅ **S1-BE-03 · Middlewares base:** `requestId`, `httpLogger` (pino con `redact`), `notFound`, `errorHandler`, `AppError` + catálogo.
  *Acepta:* test de contrato: ruta inexistente → 404 `{ code: 'NOT_FOUND', message, requestId }`, sin stack.
- [x] ✅ **S1-BE-04 · `GET /internal/health`**: 503 si Mongo no responde; con Redis caído, 200 y `status: 'degraded'` (cambio del 2026-10-19, #15: si no, el ALB interno sacaba a todas las instancias).
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

⛔ **Traspaso al equipo de AWS.** Fuera del alcance del equipo de la app: lo implementan y cierran las personas que se encargan de AWS (decidido 2026-10-11).

**Estado (2026-10-28, Paula):** templates de los 8 stacks en `infra/templates/`, comandos `task aws:*` y `task back:release`. En la cuenta A (dev, versión reducida) está la cadena completa verificada, con dominio: `https://api.dev.junteapp.me/api/v1/health` responde 200 por HTTPS con Mongo y Redis `up` ([evidencia](../evidencia/)). La topología completa (3 nodos de MongoDB, 2 NAT, 2 back, 2 Nginx) se monta en la cuenta B en el sprint 7. Detalle en [plan-aws.md](../infra/plan-aws.md).

**Qué necesitan saber del lado de la app y el back:**

- **Decisiones que les tocan** (propuestas en [pendientes](../pendientes.md)): [Redis](../pendientes.md#redis) (ElastiCache con réplica en la otra AZ), cómo corre el back en EC2 (contenedor con el target `prod` del `Dockerfile` o proceso con systemd) y [TLS interno](../pendientes.md#tls-interno).
- ✅ **Secretos:** decidido SDK al arrancar e implementado (`src/config/secrets.js`, #21/#22): con `JWT_SECRET_ID` y `MONGO_URI_SECRET_ID` el back lee `JWT_SECRET` y `MONGO_URI` de Secrets Manager. Probado en AWS el 2026-10-25.
- **Variables que el back exige:** `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL`, `JWT_SECRET` (ver `back-service/.env.example`). Desde el Sprint 2 se suman `S3_BUCKET` y `AWS_REGION` (opcionales en desarrollo/test, **obligatorias con `NODE_ENV=production`**; ver `.env.example`). No hay credenciales en el código: usa el rol IAM de la instancia.
- **S3 (lo necesita el Sprint 2 para fotos):** bucket privado con Block Public Access. El rol del back necesita `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre `users/*` y `plans/*`, y `s3:ListBucket` sobre el bucket (sin él, `HeadObject` de una clave inexistente da 403 en vez de 404; ver el rol en `infra/templates/00-base.yml`); las claves llevan prefijo del dueño (`users/<userId>/…`, `plans/<planId>/…`). Sin CORS: la app móvil no es un navegador.
- **Dominios y DNS (S1-INF-10):** cuando existan, reemplazar los `*.invalid` de `mobile/eas.json`. Hasta entonces `app.config.js` aborta los builds de `preview` y `production`.
- **Health checks de los ALB:** público → Nginx `/health`; interno → `/internal/health` en `:3000`. Ambos con idle timeout de 300 s.
- **Verificación pendiente de punta a punta:** el proxy WebSocket de Nginx (upgrade, 300 s) solo se probará con Socket.io en el Sprint 5.

- [x] ✅ **S1-INF-05 · VPC:** subredes públicas (2 AZ), privadas de borde y aplicación (2 AZ), de datos (3 AZ); IGW; **NAT por AZ**; tablas de rutas; VPC endpoints (S3, Secrets Manager, Logs, SSM).
  *Estado:* `10-network.yml` y `20-egress.yml` (Paula, #12 y #19). Desplegado en dev con **1 NAT** (desvío temporal de ADR-0005, documentado en el plan); el NAT por zona y los endpoints de interfaz están en los parámetros de entrega y se verifican en la cuenta B (S7-QA-07). Evidencia: PR #12 (red) y [NAT](../evidencia/s1-pasos-1.5-1.6-egress-mongo.md).
- [x] ✅ **S1-INF-06 · Security Groups** con la cadena de [02](../arquitectura/02-comunicacion-y-red.md#matriz-de-security-groups).
  *Estado:* los seis grupos, sin el 22 ni el 80 y sin salida "todo permitido" (#12). La prueba de aislamiento con todas las capas encendidas es S7-QA-04.
- [x] ✅ **S1-INF-07 · S3 privado, Secrets Manager, roles IAM** de mínimo privilegio, Redis privado.
  *Estado:* `00-base.yml` y `30-redis.yml` (#13, #19); fotos privadas (URL sin firma → 403), 7 secretos, Redis en ElastiCache detrás de `sg-redis`. **Limitación:** los roles por capa están escritos detrás de `CreateIamRoles`, pero el lab no permite crearlos (todas las EC2 usan `LabInstanceProfile`). Evidencia: [base](../evidencia/s1-base-pasos-1.1-1.2.md) y [Redis y back](../evidencia/s1-pasos-1.7-1.8-redis-back.md).
- [x] ✅ (Paula) **S1-INF-08 · MongoDB replica set** de 3 nodos en 3 AZ, autenticación, usuario de la app, migraciones aplicadas.
  *Acepta:* `rs.status()` con 3 miembros; apagar el primario elige otro.
  *Estado:* en dev, replica set de **3 nodos** (uno por zona) desde el 2026-11-01, con autenticación, `keyFile`, 4 usuarios de mínimo privilegio, transacciones, 20 migraciones y los 14 índices obligatorios ([evidencia de 1 nodo](../evidencia/s1-pasos-1.5-1.6-egress-mongo.md), [paso a 3 nodos y elección de primario](../evidencia/s6-backup-restore-3-nodos.md)). En la cuenta B se repite con `task aws:mongo-init ENV=entrega`.
- [ ] 🔄 (Paula) **S1-INF-09 · ALB interno** (:3000, health `/internal/health`, **idle 300 s**) + back en 2 AZ.
  *Estado:* `40-back.yml` desplegado en dev con **1 instancia**: destino `healthy`, el back lee los secretos con el SDK y su health da Mongo y Redis `up` ([evidencia](../evidencia/s1-pasos-1.7-1.8-redis-back.md)). Desde Nginx el ALB interno responde 200 y el back no es alcanzable salteándolo ([evidencia](../evidencia/s1-paso-1.9-dns-front.md)). **Falta en AWS:** 2 instancias en 2 AZ (cuenta B).
- [x] ✅ **S1-INF-10 · Nginx en 2 AZ + ALB público** (443, ACM, :8080, **idle 300 s**), DNS.
  *Acepta:* `https://<dominio>/health` → 200; las instancias no tienen IP pública; desde Internet no responden 8080/3000/22.
  *Estado:* criterio cumplido en dev (2026-10-28): `https://api.dev.junteapp.me/health` → 200, `/api/v1/health` → 200 con Mongo y Redis `up`; ninguna instancia con IP pública; desde Internet solo responde el 443 (ni 80, 8080, 3000, 6379, 27017 ni 22); certificado ACM validado por DNS, TLS 1.2/1.3; `smoke.sh` 33/33 ([evidencia](../evidencia/s1-paso-1.9-dns-front.md)). Dominio `junteapp.me`, `dev.junteapp.me` delegado a Route 53. En dev hay 1 instancia de Nginx; las 2 AZ, en la cuenta B.

## Documentación

- [ ] **S1-DOC-01 · Validar con el equipo** los pendientes del sprint 2 y 3 y llevar las correcciones de la [sección A de pendientes](../pendientes.md#a-cambios-a-llevar-al-informe) al informe.
- [ ] **S1-DOC-02 · README** con setup en 5 minutos probado por alguien que no lo escribió.
