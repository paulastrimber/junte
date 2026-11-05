# Evidencia · Backups, restauración, MongoDB de 3 nodos y verificaciones (sprint 6)

- **Fecha:** 2026-11-01, 19:50 a 21:15 (UTC−3)
- **Cuenta:** A, "dev" (AWS Academy Learner Lab), región `us-east-1`
- **Stacks:** los permanentes y, con `task aws:up`, `egress`, `redis`, `back` y `front` (1 back, 1 Nginx). `junte-dev-mongo` pasó de 1 a 3 nodos. `junte-dev-restore` ([`32-restore.yml`](../../infra/templates/32-restore.yml)) existió solo durante la prueba de restauración.
- **Tareas:** S6-INF-01, S6-INF-02, S6-INF-03, S6-INF-04, S1-INF-08; pasos 2.1, 2.2, 3.1 y 5.2 del plan; la parte de MongoDB de S7-QA-06
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md)

Sin ID de cuenta ni valores de secretos. Lo hecho "desde Internet" se corrió desde la conexión de Paula. El usuario de prueba (`qa-aws-…@example.com`) y su plan cancelado quedaron en la base de dev.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| Backup periódico instalado y funcionando (S6-INF-03) | ✅ `backups/mongo-dev-<fecha>.archive.gz`, timer cada hora en los 3 nodos |
| Restauración en un entorno separado (S6-INF-04) | ✅ 16 colecciones con los mismos documentos e índices; restaurar 2 s, el total 4 min |
| Replica set de 3 nodos, uno por zona (S1-INF-08) | ✅ 1 PRIMARY y 2 SECONDARY, con los datos del nodo original |
| Al detener el primario, otro toma su lugar | ✅ elección en 1 s; la API respondió 200 durante los 2 minutos de la prueba; transacciones con el primario nuevo |
| El nodo detenido vuelve solo | ✅ vuelve como SECONDARY |
| Solo 443 desde Internet | ✅ 22, 80, 3000, 6379, 8080 y 27017 cerrados |
| Session Manager en todas las EC2, sin claves ni puerto 22 (S6-INF-02) | ✅ |
| `requestId` en los logs de Nginx y del back (S6-INF-01) | ✅ |
| Sin datos sensibles en CloudWatch (24 h) | ✅ ninguna línea con `password`, `Bearer`, `refreshToken`, `accessToken`, `birthDate`, `latitude`, `longitude`, `lat=`, `lng=` ni `near=` |
| Foto de perfil y de plan de punta a punta (2.1, 3.1) | ✅ la URL sin firma da 403; una clave inexistente, 404 (no 500) |
| Argon2 en `t3.small` (2.2) | ✅ ~200 ms por login en el servidor; el back usa 155 MiB, la instancia tiene 1,27 GB libres |
| WebSocket ocioso 5,5 min por los dos ALB (5.2, S5-NG-01) | ✅ sigue conectado |
| `smoke.sh` con `SMOKE_SKIP_LOCAL=1` | ✅ 33 ok, 0 fallidas, 2 omitidas (después de corregir un caso intermitente, ver 7) |

## 1. Backup (S6-INF-03)

El timer nunca se había instalado en AWS (`/opt/junte/` no existía) y `task aws:backup` no lo avisaba: el `systemctl start` fallaba, pero el `journalctl` que venía después terminaba bien. Ahora el comando avisa. `task aws:mongo-init` lo instaló y el primer backup corrió enseguida:

```
==> Últimos backups
2026-11-01 20:19:39      16628 mongo-dev-20261101T231936Z.archive.gz
2026-11-01 20:20:09      16624 mongo-dev-20261101T232006Z.archive.gz
```

Con 3 nodos, lo hace el primer secundario por host. El timer quedó en los tres.

## 2. De 1 a 3 nodos (S1-INF-08)

**Problema 1: el reemplazo del nodo con datos.** El primer change set de `junte-dev-mongo` con `NodeCount=3` traía `NodeA · Modify · Reemplazo True`. La causa era `ImageId`, que salía del parámetro SSM "latest" de Amazon Linux 2023: AWS había publicado una AMI nueva (`ami-0c23…` en lugar de `ami-04b9…`). Cualquier deploy de `mongo` habría reemplazado el nodo, con IP fija y disco de datos propio. Ahora la AMI queda fija en `infra/parameters/<env>/31-mongo.json` y el change set quedó así:

```
|  Add   |  DataVolumeB  |  None      |  AWS::EC2::Volume    |
|  Add   |  DataVolumeC  |  None      |  AWS::EC2::Volume    |
|  Add   |  NodeB        |  None      |  AWS::EC2::Instance  |
|  Add   |  NodeC        |  None      |  AWS::EC2::Instance  |
```

**Problema 2: los miembros nuevos no se sumaban.** `init-replica-set.sh` solo iniciaba el replica set cuando no existía. Ahora suma los miembros que faltan de a uno y espera a que cada uno llegue a SECONDARY. También se corrigió `wait_mongo_running`, que cortaba `mongo-init` sin mostrar el error cuando un nodo recién creado todavía no tenía Mongo corriendo. Salida de `task aws:mongo-init ENV=dev`:

```
miembro 10.0.31.10:27017: agregado, sincronizando
miembro 10.0.31.10:27017: SECONDARY
miembro 10.0.32.10:27017: agregado, sincronizando
miembro 10.0.32.10:27017: SECONDARY
miembros sanos: 3/3
junte/dev/mongo-app-uri: actualizado con los hosts 10.0.30.10:27017,10.0.31.10:27017,10.0.32.10:27017
1. rs0: 3 miembro(s)
   10.0.30.10:27017 PRIMARY health=1 prioridad=1
   10.0.31.10:27017 SECONDARY health=1 prioridad=1
   10.0.32.10:27017 SECONDARY health=1 prioridad=1
2. sin usuario: Unauthorized
3. junte_app escribe y borra en junte: ok
   escribe en otra base: Unauthorized
   lee usuarios de admin: Unauthorized
4. transacción con commit: 2 documentos
   transacción con abort: 0 documentos
```

Después se reinició el contenedor del back (`/opt/junte/start-back.sh latest`) para que leyera la URI con los 3 hosts. Antes ya se reconectaba al replica set, pero un arranque con el nodo A caído no habría encontrado ningún host.

## 3. Elección de primario (parte de MongoDB de S7-QA-06)

`docker stop mongo` en el nodo A (primario) a las 23:24:49 UTC, mientras se consultaba `GET /api/v1/health` cada 3 s:

```
23:25:02 200 0.445089s {"status":"ok","checks":{"mongo":"up","redis":"up"}}
…   (30 consultas, todas 200)
23:26:56 200 0.522516s {"status":"ok","checks":{"mongo":"up","redis":"up"}}
```

Desde el nodo B, con el usuario admin y una transacción con `junte_app`:

```
10.0.30.10:27017 (not reachable/healthy)
10.0.31.10:27017 PRIMARY (elegido 2026-11-01T23:24:50.000Z)
10.0.32.10:27017 SECONDARY
transaccion con el primario nuevo: 1 documento(s)
```

Con `docker start mongo` el nodo A volvió como SECONDARY. El health solo hace un ping, que también contesta un secundario: la escritura en transacción es la que prueba que hay primario.

## 4. Restauración (S6-INF-04)

`task aws:restore ENV=dev`: backup nuevo, conteo en el replica set, EC2 temporal con un `mongod` vacío en `127.0.0.1` (grupo de seguridad propio, sin entrada), restauración, conteo y borrado del stack.

```
==> Restaurando backups/mongo-dev-20261101T232829Z.archive.gz en i-…
restaurado backups/mongo-dev-20261101T232829Z.archive.gz en 2 s
==> Comparación (colección documentos índices)
Iguales: la restauración de backups/mongo-dev-20261101T232829Z.archive.gz funciona (4 min en total).
```

| Colección | Documentos | Índices |
|-----------|-----------:|--------:|
| careers | 250 | 2 |
| changelog | 20 | 1 |
| changelog_lock | 0 | 2 |
| checkIns | 0 | 2 |
| cities | 1 | 2 |
| deviceTokens | 0 | 3 |
| interestCategories | 8 | 2 |
| interests | 57 | 3 |
| messages | 0 | 3 |
| neighborhoods | 62 | 2 |
| planParticipants | 0 | 3 |
| plans | 0 | 4 |
| reports | 0 | 3 |
| sessions | 0 | 4 |
| universities | 7 | 2 |
| users | 0 | 3 |

Iguales en el origen y en lo restaurado. `junte-dev-restore` ya no existe (`describe-stacks` → `does not exist`). La base de dev tiene casi solo catálogos: el tiempo de restauración con datos reales se mide de nuevo en la cuenta B (S7-QA-09).

## 5. `task aws:verify ENV=dev` (S6-INF-01, S6-INF-02, S7-QA-04 desde Internet, S7-QA-10)

```
==> 1. Puertos desde Internet en api.dev.junteapp.me (solo 443)
  22: cerrado (ok)
  80: cerrado (ok)
  3000: cerrado (ok)
  6379: cerrado (ok)
  8080: cerrado (ok)
  27017: cerrado (ok)
  443: abierto (ok)
==> 2. Session Manager, sin pares de claves ni puerto 22
  EC2 encendidas: 5 · fuera de Session Manager: ninguna
  con par de claves: 0 · grupos de seguridad que aceptan el 22: 0
==> 3. requestId en los logs de Nginx y del back
  GET /users/me sin token → requestId d2e87a0be023dfc566dea22a0d97dbb6 (esperando a que llegue a CloudWatch)
  /junte/dev/nginx: 1 línea(s) (ok)
  /junte/dev/back: 1 línea(s) (ok)
==> 4. Datos sensibles en los logs de las últimas 24 h (cantidad de líneas; no se muestra el contenido)
  ninguno (ok)
```

Se corrió mientras se creaban los nodos B y C (por eso 5 EC2). Volvió a pasar al final de la sesión, dentro del ensayo de `task aws:bootstrap ENV=dev`.

## 6. Fotos y Argon2 (pasos 2.1, 2.2 y 3.1)

Script de Node contra `https://api.dev.junteapp.me/api/v1`, con un usuario nuevo y un PNG de 1×1:

```
ok   presign de perfil · status 200, clave users/6ae7…/…
ok   PUT a S3 con la URL firmada · status 200
ok   PUT /users/me/photo · status 200
ok   el perfil trae una URL firmada
ok   la URL firmada baja la foto · status 200, image/png
ok   la misma URL sin firma da 403 · status 403
ok   clave inexistente da 404 y no 500 (ListBucket) · status 404, NOT_FOUND
ok   POST /plans · status 201
ok   presign de plan · status 200, clave plans/6ae7…/…
ok   PUT a S3 con la URL firmada · status 200
ok   PUT /plans/:id/photo · status 200
```

Argon2: 6 logins separados 7 s (el rate limit de login es 10 por minuto por IP; los 10 seguidos del primer intento dieron 429 desde el sexto, como corresponde), contra `GET /catalogs` como referencia de red:

```
login ms:     528 492 482 509 483 504
catalogs ms:  294 297 291 296 297 341
mediana: login 504 ms, catalogs 297 ms → Argon2 + sesión ≈ 206 ms en el servidor
back cpu=0.49% mem=155.4MiB / 1.865GiB
Mem:   total 1909   used 459   available 1271
```

## 7. Smoke test

La primera corrida dio 32 ok y 1 fallida: `/api/v1/auth/LOGIN → 404, se esperaba 429`. Después de la ráfaga, la zona `auth` (10 por minuto) repone de a poco y un request suelto puede pasar en cualquier momento: midiendo, después de dos 429 pasó un login a los 3,3 s. Era un test intermitente, no un cambio de Nginx. Ahora cada variante se intenta hasta 3 veces y pasa si al menos una da 429. Fuera de la zona estricta no daría ninguna. Dos corridas seguidas: `33 ok, 0 fallidas, 2 omitidas`.

## 8. WebSocket ocioso (paso 5.2, S5-NG-01)

Cliente Socket.io (el `socket.io-client` del back), solo `websocket`, `path: /api/v1/socket.io`, con el token del usuario de prueba y `reconnection: false`, sin mandar nada durante 330 s:

```
conectado (websocket) a los 1 s
ok: sigue conectado a los 330 s (connected)
DESCONECTADO a los 330 s: io client disconnect      ← el cierre del propio script
```

Pasa por los dos ALB (idle 300 s) sin cortarse. Los ping/pong de Engine.io (cada 25 s) mantienen viva la conexión: la prueba confirma que nada en la cadena la corta, no que el ALB tolere más de 300 s sin ningún frame.
