# Evidencia · Despliegue de "entrega" en la cuenta B (paso 7.1)

- **Fecha:** 2026-11-06, 15:30 a 20:30 (UTC−3)
- **Cuenta:** B, "entrega" (AWS Academy Learner Lab), región `us-east-1`, perfil `junte-entrega`
- **Stacks:** los permanentes (`network`, `base`, `dns` con la zona `app.junteapp.me` y su certificado, `mongo` con 3 nodos) y, por sesión, `egress` (2 NAT y endpoints de interfaz), `redis` (primario y réplica), `back` (2 instancias) y `front` (2 Nginx)
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md), paso 7.1 (y 0.2 y 5.1 para la cuenta B)
- **API:** `https://api.app.junteapp.me/api/v1`

Sin ID de cuenta ni valores de secretos: las salidas se pasaron por `sed -E 's/[0-9]{12}/<cuenta>/g'`, que también tapa los 12 primeros dígitos de los nombres de las migraciones. Los IDs de instancia se omiten. Lo hecho "desde Internet" se corrió desde la conexión de Paula Steverlynck.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| Alerta de presupuesto (0.2) | ✅ `junte-entrega-30usd`: 30 USD por mes, avisos al 50 % y 80 % reales y al 100 % previsto. Por CLI: la consola de Budgets no cargaba en el navegador |
| Red, base, zona `app.junteapp.me`, delegación y certificado | ✅ los 4 NS se cargaron en Namecheap como registro `NS` de `app` |
| Imagen del back en ECR | ✅ `junte-entrega-back:102c03f` y, después del `git pull`, `a20c91a` con `task back:release` |
| MongoDB de 3 nodos: replica set, usuarios, `mongo-app-uri` y backup | ✅ 1 PRIMARY y 2 SECONDARY, permisos de `junte_app` y transacciones verificados, timer de backup en los 3 nodos |
| Redis, back, migraciones y front | ✅ 23 migraciones aplicadas (20 + 3 con la imagen nueva), catálogos sincronizados |
| `/api/v1/health` | ✅ `{"status":"ok","checks":{"mongo":"up","redis":"up"}}` |
| Smoke test, primera corrida | ❌ 32 ok, 1 fallida, 2 omitidas (ver 3) |
| Smoke test con el chequeo corregido (PR #33) | ✅ 33 ok, 0 fallidas, 3 omitidas |
| `task aws:verify` | ✅ solo 443 desde Internet; 7 EC2 en Session Manager, sin claves ni puerto 22; `requestId` en Nginx y back; sin datos sensibles en 24 h |
| Secreto de FCM (5.1) | ✅ `junte/entrega/fcm-service-account` creado. El push sigue apagado (ver 6) |
| Cierre | ✅ `task aws:down`: nada cobrando por hora |
| Duración del entorno completo | 24 min con `bootstrap` (sin la espera del DNS); 13 min para encender la sesión |
| Crédito usado | 3,4 USD al abrir · PENDIENTE al cerrar (de 50 USD) |

## 1. Presupuesto (paso 0.2)

La consola de Budgets mostraba "Unable to load content" en el navegador, así que se creó con `aws budgets create-budget` (ID de cuenta en una variable, sin imprimirlo). `describe-budgets` lo lista:

```
--- presupuestos en la cuenta:
junte-entrega-30usd
```

## 2. `task aws:bootstrap ENV=entrega`, primera corrida

Crea `network`, `base` y `dns`, y se frena para la delegación:

```
  A mano, una sola vez: en el proveedor de junteapp.me, crear el registro NS "app" con estos 4 valores:
    ns-1067.awsdns-05.org
    ns-1869.awsdns-41.co.uk
    ns-246.awsdns-30.com
    ns-601.awsdns-11.net
  Esperando a que la delegación se vea en el DNS público (se revisa cada 30 s, hasta 2 horas)...
```

Los registros se cargaron más tarde en Namecheap; al volver a correr el comando, lo creado se salteó:

```
No changes to deploy. Stack junte-entrega-dns is up to date
  app.junteapp.me ya está delegado a Route 53.
...
Successfully created/updated stack - junte-entrega-dns
```

Siguió con la imagen (`junte-entrega-back:102c03f`), `egress`, `mongo` y `mongo-init`:

```
miembros sanos: 3/3
junte/entrega/mongo-app-uri: creado con los hosts 10.0.30.10:27017,10.0.31.10:27017,10.0.32.10:27017
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

El backup quedó instalado en los 3 nodos (`s3://<OpsBucket>/backups/`). Después `redis`, `back`, 20 migraciones, catálogos y `front`:

```
==> Esperando a https://api.app.junteapp.me/api/v1/health (hasta 10 minutos)
{"status":"ok","checks":{"mongo":"up","redis":"up"}}

Sesión encendida en 13 min. Al terminar: task aws:down ENV=entrega
```

## 3. Smoke test: el chequeo de `X-Forwarded-For` (❌ y su corrección)

La primera corrida dio `32 ok, 1 fallidas, 2 omitidas`:

```
Rate limit en /api/v1/auth/login
  [ OK ] ráfaga → 429 en el request 14 (400 400 400 400 400 400 400 400 400 400 400 400 400 429)
  [FAIL] con un X-Forwarded-For inventado el cliente externo evadió el límite (400)
```

**Causa:** no era un spoofing. Delante de Nginx hay un ALB que agrega la IP real al final del `X-Forwarded-For`, y Nginx (`real_ip_recursive on`, confiando solo en el CIDR de la VPC) termina en esa IP. En los logs de `/junte/entrega/nginx` ningún request figura con la IP inventada. Lo que pasa es que en entrega hay **2 Nginx** y cada uno cuenta el límite por separado: el 429 del request 14 salió de un Nginx y el request con el header inventado cayó en el otro, que todavía tenía cupo. En dev hay uno solo, por eso ahí pasaba.

**Corrección** (PR #33, `test(front): send a different spoofed X-Forwarded-For on every request of the burst`): el chequeo manda un `X-Forwarded-For` inventado y distinto en cada request de la ráfaga. Si Nginx le creyera, cada request sería una IP nueva y nunca llegaría el 429. No depende de qué Nginx atiende. No se tocó la configuración de Nginx.

**Pendiente para decidir con el equipo:** con N instancias de Nginx, el límite efectivo de `/auth/*` es unas N veces el configurado (en entrega, unos 12 intentos antes del primer 429 en lugar de 6).

## 4. Cierre interrumpido y segunda corrida

El primer `task aws:down` se cortó porque venció la sesión del lab (`voc-cancel-cred`) mientras borraba `egress`: los NAT llegaron a borrarse, pero `junte-entrega-egress` quedó en `DELETE_FAILED` por `Ec2MessagesEndpoint`, también por las credenciales canceladas. Con Start Lab y credenciales nuevas, un segundo `aws:down` lo terminó:

```
==> Lo que cobra por hora en la cuenta
  NAT Gateways: 0 · balanceadores: 0 · Redis: 0 · IP elásticas: 0 · endpoints de interfaz: 0
Nada cobrando por hora. Anotá el crédito usado.
```

Con `main` actualizado (`a20c91a`), `task aws:bootstrap ENV=entrega` salteó lo permanente y recreó la sesión:

```
==> Paso 7/7 · Verificaciones
...
  [ OK ] ráfaga → 429 en el request 15 (400 400 400 400 400 400 400 400 400 400 400 400 400 400 429)
  [ OK ] X-Forwarded-For inventado y distinto en cada request se ignora (429 en el request 1)
...
33 ok, 0 fallidas, 3 omitidas
SMOKE TEST OK

==> 1. Puertos desde Internet en api.app.junteapp.me (solo 443)
  22: cerrado (ok)
  80: cerrado (ok)
  3000: cerrado (ok)
  6379: cerrado (ok)
  8080: cerrado (ok)
  27017: cerrado (ok)
  443: abierto (ok)

==> 2. Session Manager, sin pares de claves ni puerto 22
  EC2 encendidas: 7 · fuera de Session Manager: ninguna
  con par de claves: 0 · grupos de seguridad que aceptan el 22: 0

==> 3. requestId en los logs de Nginx y del back
  /junte/entrega/nginx: 1 línea(s) (ok)
  /junte/entrega/back: 1 línea(s) (ok)

==> 4. Datos sensibles en los logs de las últimas 24 h (cantidad de líneas; no se muestra el contenido)
  ninguno (ok)

Todo bien. Para la evidencia: copiar esta salida a docs/evidencia/.

Entorno entrega completo en 24 min: https://api.app.junteapp.me/api/v1. Al terminar: task aws:down ENV=entrega
```

Las 3 omitidas necesitan el entorno local (access log y red de confianza).

## 5. Back actualizado a `main`

`bootstrap` no reconstruye la imagen si ya hay una `latest` en ECR (`Ya hay una imagen latest en ECR`), así que el back seguía en `102c03f`. `task back:release ENV=entrega` lo llevó a `main`, de a una instancia:

```
Imagen: junte-entrega-back:a20c91a (y latest).
==> Migraciones y catálogos (imagen a20c91a)
MIGRATED UP: <cuenta>00-create-spot-alerts.js
MIGRATED UP: <cuenta>00-plans-reminder-sent-at.js
MIGRATED UP: <cuenta>00-messages-voice.js
== migraciones pendientes: 0
catalogs:sync OK
<back-a>: sano con a20c91a
<back-b>: sano con a20c91a
{"status":"ok","checks":{"mongo":"up","redis":"up"}}
Back actualizado a a20c91a.
```

Después, `task aws:verify ENV=entrega` volvió a dar `Todo bien`.

## 6. Secreto de FCM (paso 5.1 en la cuenta B)

El JSON de la cuenta de servicio de Firebase (proyecto `junte-ebef4`) se comprobó con `jq` (JSON válido, `.type == "service_account"`) sin mostrar su contenido, y se cargó desde el archivo local, que después se borró:

```
aws secretsmanager create-secret --name junte/entrega/fcm-service-account --secret-string file://<ruta>
junte/entrega/fcm-service-account
--- health del back:
200
```

**El push sigue apagado.** `aws:up` y `bootstrap` despliegan `back` sin parámetros extra, así que `Push` sale de [`infra/parameters/entrega/40-back.json`](../../infra/parameters/entrega/40-back.json), que dice `disabled`. Para que quede prendido hay que cambiar ese archivo a `enabled`. `task aws:deploy ENV=entrega STACK=back PARAMS='Push=enabled'` lo prende solo hasta el próximo `aws:up`.

## 7. Otros

- La cuenta tiene 50 USD de crédito total (el plan decía 40).
- La EC2 `otrainstancia` (`t3.micro`, ajena a junte) se borró.
