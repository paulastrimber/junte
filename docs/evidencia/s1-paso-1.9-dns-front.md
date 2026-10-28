# Evidencia · Dominio, certificado y entrada pública (paso 1.9)

- **Fecha:** 2026-10-28, 19:15 a 20:10 (UTC−3)
- **Cuenta:** A, "dev" (AWS Academy Learner Lab), región `us-east-1`
- **Dominio:** `junteapp.me` (Namecheap, a nombre de Paula); `dev.junteapp.me` delegado a Route 53 en esta cuenta
- **Stacks:** `junte-dev-dns` ([`01-dns-cert.yml`](../../infra/templates/01-dns-cert.yml)) y, con `task aws:up`, `egress`, `redis`, `back` y `junte-dev-front` ([`50-front.yml`](../../infra/templates/50-front.yml)), 1 instancia de Nginx
- **Tareas:** S1-INF-10 (Nginx, ALB público, certificado y DNS); parte de S5-NG-01 (WebSocket a través de los dos ALB)
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md), pasos 1.9 y 1.10

Sin ID de cuenta ni valores de secretos. Lo hecho "desde Internet" se corrió desde la conexión de Paula.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| Subdominio delegado a Route 53 | ✅ Cloudflare y Google devuelven los 4 NS de AWS para `dev.junteapp.me` |
| Certificado ACM validado por DNS | ✅ `ISSUED` en 3 min, `CN=api.dev.junteapp.me`, emisor Amazon, vence 2027-05-13 |
| `https://api.dev.junteapp.me/health` → 200 (Nginx) | ✅ `ok` |
| `https://api.dev.junteapp.me/api/v1/health` → 200 con Mongo y Redis `up` | ✅ `{"status":"ok","checks":{"mongo":"up","redis":"up"}}` |
| Solo 443 desde Internet; TLS 1.2 o 1.3 | ✅ 80, 8080, 3000, 6379, 27017 y 22 no responden; TLS 1.0 y 1.1 rechazados |
| `smoke.sh` con `SMOKE_SKIP_LOCAL=1` | ✅ 33 ok, 0 fallidas, 2 omitidas (solo locales) |
| WebSocket a través de ALB → Nginx → ALB interno → back | ✅ upgrade → 101 (smoke) |
| Rate limit por IP real detrás del ALB | ✅ un `X-Forwarded-For` inventado por el cliente no esquiva el 429 (smoke) |
| Ninguna instancia con IP pública | ✅ back, Nginx y Mongo sin IP pública, sin par de claves, IMDSv2 |
| Desde Nginx: ALB interno responde; 6379 y 27017 no | ✅; además Nginx no llega al back directo sin pasar por el ALB interno |
| Redis caído → health 200 `degraded` y el ALB no saca al back (#15) | ✅ 70 s `degraded`, destino `healthy` todo el tiempo; vuelve a `ok` solo |
| `task aws:up` | ✅ 14 min, migraciones 0 pendientes, health `ok` al final |

## 1. DNS y certificado

```
$ task aws:deploy ENV=dev STACK=dns          (CreateCertificate=false)
|  Add   |  HostedZone |  AWS::Route53::HostedZone   |
junte-dev-dns: CREATE_COMPLETE
NameServers: ns-1888.awsdns-44.co.uk, ns-645.awsdns-16.net, ns-1242.awsdns-27.org, ns-46.awsdns-05.com
```

En Namecheap (Advanced DNS), 4 registros NS con host `dev`. Los nameservers del dominio siguen siendo los de Namecheap.

```
$ dig +short NS dev.junteapp.me @1.1.1.1      (y @8.8.8.8)
ns-1242.awsdns-27.org. ns-1888.awsdns-44.co.uk. ns-46.awsdns-05.com. ns-645.awsdns-16.net.

$ task aws:deploy ENV=dev STACK=dns PARAMS="CreateCertificate=true"
|  Add  |  ApiCertificate  |  AWS::CertificateManager::Certificate   |
junte-dev-dns: UPDATE_COMPLETE        (3 min)

aws acm describe-certificate:
  dominio api.dev.junteapp.me · estado ISSUED · validación DNS SUCCESS · emisor Amazon · RSA-2048 · vence 2027-05-13
```

`infra/parameters/dev/01-dns-cert.json` queda con `CreateCertificate=true`: si no, un despliegue de `dns` sin el parámetro extra borraría el certificado.

## 2. Encendido

```
$ task aws:up ENV=dev
==> junte-dev-egress / junte-dev-redis / junte-dev-back
==> Migraciones y catálogos
== migraciones pendientes: 0
catalogs:sync OK — nuevas entradas (… todas 0)
==> Subiendo front-service/ a s3://junte-dev-ops-95xbnn/nginx/
==> junte-dev-front (50-front.yml)
==> API: https://api.dev.junteapp.me/api/v1 (EXPO_PUBLIC_API_URL)
{"status":"ok","checks":{"mongo":"up","redis":"up"}}
Sesión encendida en 14 min.
```

## 3. Desde Internet

```
== DNS: api.dev.junteapp.me -> <IP del ALB público>
== GET https://api.dev.junteapp.me/health          ok  -> HTTP 200
== GET https://api.dev.junteapp.me/api/v1/health   {"status":"ok","checks":{"mongo":"up","redis":"up"}}  -> HTTP 200
== certificado
  subject=CN=api.dev.junteapp.me
  issuer=C=US, O=Amazon, CN=Amazon RSA 2048 M01
  notAfter=May 13 23:59:59 2027 GMT
  verificación TLS: válida
  tls1: rechazado · tls1_1: rechazado
== puertos (timeout 5 s)
  443: abierto · 80, 8080, 3000, 6379, 27017, 22: no responden
```

`bash front-service/tests/smoke.sh https://api.dev.junteapp.me` con `SMOKE_SKIP_LOCAL=1`:

```
Proxy /api/v1/* → back /internal/*: 5 OK (1 omitida: access log local)
WebSocket: upgrade → 101 del back; long-polling deshabilitado → 400
client_max_body_size: ~1.1 MB → 413
Rate limit en /api/v1/auth/login: 429 en el request 7, JSON con requestId; X-Forwarded-For externo ignorado;
  register, Login, LOGIN, login/ y Register/ comparten el límite; refresh, logout y logout-all no
Panel /admin: 200 HTML con CSP, X-Frame-Options DENY, nosniff, no-store y X-Request-Id; /api/v1/admin/metrics sin token → 401
33 ok, 0 fallidas, 2 omitidas · SMOKE TEST OK
```

## 4. Desde adentro

`aws ec2 describe-instances` (en ejecución):

```
junte-dev-back-a   10.0.20.174  sin IP pública  sin par de claves  IMDSv2
junte-dev-front-a  10.0.10.62   sin IP pública  sin par de claves  IMDSv2
junte-dev-mongo-a  10.0.30.10   sin IP pública  sin par de claves  IMDSv2
```

Desde la instancia de Nginx, por Session Manager:

```
ALB interno :3000 /internal/health -> {"status":"ok","checks":{"mongo":"up","redis":"up"}} (HTTP 200)
Redis :6379 -> no responde
Mongo 10.0.30.10:27017 -> no responde
back directo 10.0.20.174:3000 (sin el ALB interno) -> no responde
```

## 5. Redis caído

En la instancia del back, una regla temporal de `iptables` (cadena `DOCKER-USER`) rechazó durante 70 s el tráfico del contenedor al 6379 y se quitó sola (`trap`). Sin cambios en la infraestructura. Desde afuera, cada ~10 s:

```
20:07:57  público: {"status":"degraded","checks":{"mongo":"up","redis":"down"}} 200  destino ALB: healthy
   … (6 lecturas iguales, 70 s) …
20:08:55  público: {"status":"degraded","checks":{"mongo":"up","redis":"down"}} 200  destino ALB: healthy
20:09:07  público: {"status":"ok","checks":{"mongo":"up","redis":"up"}} 200        destino ALB: healthy
```

La API siguió respondiendo y el ALB interno no sacó al back (cambio del #15); al volver Redis, el back se reconectó solo.

## 6. App

`mobile/eas.json`, perfil `preview`: `EXPO_PUBLIC_API_URL=https://api.dev.junteapp.me/api/v1`. El perfil `production` sigue con `.invalid` hasta que exista la cuenta B (`app.config.js` frena ese build).
