# Evidencia · Redis, back e índices (pasos 1.7, 1.8 y cierre del 1.6)

- **Fecha:** 2026-10-25, 12:05 a 12:22 (UTC−3)
- **Cuenta:** A, "dev" (AWS Academy Learner Lab), región `us-east-1`
- **Stacks:** `junte-dev-redis` ([`30-redis.yml`](../../infra/templates/30-redis.yml), 1 nodo) y `junte-dev-back` ([`40-back.yml`](../../infra/templates/40-back.yml), 1 instancia), con `task aws:deploy`; imagen con `task back:release`
- **Tareas:** S1-INF-07 (Redis), S1-INF-09 (ALB interno y back), S1-INF-08 (migraciones), S1-BE-02 (secretos por SDK)
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md), pasos 1.6 a 1.8

Sin dominio todavía: no hay `dns` ni `front`, así que la API no tiene entrada pública. Los comandos dentro de las instancias, por Session Manager. Sin ID de cuenta ni valores de secretos.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| El lab permite ElastiCache (paso 0.3, "sí (lectura)") | ✅ `junte-dev-redis` `CREATE_COMPLETE` en 5 min |
| Imagen del back en ECR para las EC2 x86_64 | ✅ `linux/amd64`, tags `9b825d3` y `latest`, una sola imagen (ver PR #25) |
| Escaneo de vulnerabilidades al subir | ✅ 0 críticas, 3 altas, 9 medias, 3 bajas. Las altas son de la imagen base (`glibc` y `zlib` de Debian 13): pendiente para back actualizar `node:22.23.3-trixie-slim` cuando haya parche |
| Destinos del ALB interno `healthy` (1.8) | ✅ en el primer chequeo |
| El back lee los secretos con el SDK (S1-BE-02) | ✅ arrancó en `production` con `JWT_SECRET_ID` y `MONGO_URI_SECRET_ID`; `back.env` (600) tiene solo nombres |
| `/internal/health` informa Mongo y Redis (1.7) | ✅ `{"status":"ok","checks":{"mongo":"up","redis":"up"}}` |
| Logs en CloudWatch, sin datos sensibles | ✅ `/junte/dev/back`, stream `back-<instancia>`; 0 coincidencias de `mongodb://`, `password` o `Bearer` |
| Migraciones con el usuario de migraciones (1.6) | ✅ 20 aplicadas, 0 pendientes, como `junte_migrations` |
| Índices de `07-modelo-de-datos.md` | ✅ 14/14 obligatorios |
| Catálogos | ✅ cargados por la migración `seed-catalogs` (57 intereses, 7 universidades, 250 carreras); `catalogs:sync` no agrega nada |
| Desde Nginx, `curl <ALB interno>:3000/internal/health` da 200 | ⏳ Necesita `front` (y el dominio). Desde el back no se puede: `sg-alb-interno` solo acepta a `sg-front` |
| Desde Nginx, el 6379 no responde | ⏳ Ídem |

## 1. Redis

```
$ task aws:deploy ENV=dev STACK=redis
|  Add   |  RedisReplicationGroup  |  None      |  AWS::ElastiCache::ReplicationGroup  |
|  Add   |  RedisSubnetGroup       |  None      |  AWS::ElastiCache::SubnetGroup       |
junte-dev-redis: CREATE_COMPLETE        (5 min)
Export junte-dev-RedisUrl: redis://<id>.42xbua.ng.0001.use1.cache.amazonaws.com:6379
```

## 2. Imagen del back

```
$ task back:release ENV=dev
Imagen: junte-dev-back:9b825d3 (y latest).
==> Construyendo back-service (target prod, linux/amd64)
==> Subiendo a ECR
Imagen subida. junte-dev-back no está encendido: la va a usar cuando se despliegue.

aws ecr describe-images:  9b825d3,latest · 89869095 bytes · application/vnd.docker.distribution.manifest.v2+json
aws ecr describe-image-scan-findings:  COMPLETE {"HIGH":3,"MEDIUM":9,"LOW":3}
  HIGH  CVE-2026-19499  glibc  2.41-12+deb13u4
  HIGH  CVE-2026-5435   glibc  2.41-12+deb13u4
  HIGH  CVE-2026-85091  zlib   1.3.dfsg+really1.3.1-1
```

La primera subida (`72a0dcd`) salió como índice OCI con un anexo de procedencia, que ECR no escanea; se corrigió con `--provenance=false --sbom=false` (PR #25). Esa imagen queda sin uso y la limpia la regla de ciclo de vida.

## 3. Back y ALB interno

```
$ task aws:deploy ENV=dev STACK=back
|  Add   |  BackA                 |  None      |  AWS::EC2::Instance                         |
|  Add   |  BackTargetGroup       |  None      |  AWS::ElasticLoadBalancingV2::TargetGroup   |
|  Add   |  InternalListener      |  None      |  AWS::ElasticLoadBalancingV2::Listener      |
|  Add   |  InternalLoadBalancer  |  None      |  AWS::ElasticLoadBalancingV2::LoadBalancer  |
junte-dev-back: CREATE_COMPLETE         (2 min)
InternalAlbDns: internal-junte--Inter-<id>.us-east-1.elb.amazonaws.com

aws elbv2 describe-target-health:  healthy
```

Dentro de la instancia:

```
== contenedor: back Up · reinicios: 0
== tag desplegado: latest
== permisos: /opt/junte/back.env 600 /opt/junte/start-back.sh 700
== variables (solo nombres): NODE_ENV PORT LOG_LEVEL MONGO_DB_NAME REDIS_URL S3_BUCKET AWS_REGION JWT_SECRET_ID MONGO_URI_SECRET_ID
== health local: {"status":"ok","checks":{"mongo":"up","redis":"up"}}
== salida a Internet: <IP del NAT>
```

CloudWatch `/junte/dev/back` (primeras líneas, JSON de pino):

```
{level: 30, msg: 'back-service listening', port: 3000, env: 'production'}
{level: 30, msg: 'scheduler started'}
{level: 30, msg: 'request completed'}      (health checks del ALB)
{level: 30, msg: 'job started'} / {level: 30, msg: 'job finished'}
```

## 4. Migraciones, catálogos e índices

Con la misma imagen del back, desde su instancia, como `junte_migrations` (la URI se arma dentro de la instancia a partir de `junte/dev/mongo-migrations`):

```
== migrate-mongo up (usuario junte_migrations)
MIGRATED UP: 20261007120000-create-users.js
… (20 en total) …
MIGRATED UP: 20261014130000-reports-reasons-and-resolution.js
== migrate-mongo status (pendientes): 0
== sync de catálogos
catalogs:sync OK — nuevas entradas (interestCategories: 0, interests: 0, universities: 0, careers: 0, cities: 0, neighborhoods: 0)
```

Las migraciones se corrieron con el back ya arriba porque era la primera instalación (base vacía). En adelante, el orden de `docs/flujo/`: migraciones y después back.

Índices obligatorios (`getIndexes()` en la base real):

```
OK users {"email":1} único
OK sessions {"sid":1} único · {"userId":1} · {"expiresAt":1} TTL
OK plans {"status":1,"startsAt":1} · {"location":"2dsphere"}
OK planParticipants {"planId":1,"userId":1} único
OK checkIns {"planId":1,"userId":1} único
OK messages {"planId":1,"createdAt":-1,"_id":-1}
OK reports {"status":1,"createdAt":1}
OK deviceTokens {"token":1} único
OK interests {"key":1} único · careers {"universityKey":1,"key":1} único · neighborhoods {"cityKey":1,"key":1} único
14/14 · colecciones: 16 · intereses: 57 · universidades: 7 · carreras: 250
```
