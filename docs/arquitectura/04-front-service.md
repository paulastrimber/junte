# 04 · Front service (capa 3 · Borde)

Nginx como proxy inverso. **No ejecuta reglas de negocio, no valida JWT como autoridad y no accede a MongoDB ni a Redis.**

## Responsabilidades

| Hace | No hace |
|------|---------|
| Publica `/api/v1/*` y lo reescribe a `/internal/*` | Decidir permisos |
| Obtiene la IP real del cliente (`X-Forwarded-For`) | Validar cuerpos o tokens |
| Rate limiting por IP real y límite de tamaño de body | Guardar estado |
| Genera **siempre** `requestId` (pisa el del cliente) y lo reenvía como `X-Request-Id` | Hablar con MongoDB o Redis |
| Proxy de WebSocket para Socket.io | |
| Responde `GET /health` (puerto 8080) al ALB público | |
| Sirve los estáticos de `/admin` | |
| Devuelve 429 en formato `{ code, message, requestId }` | |

## Estructura

```
front-service/
  nginx.conf               # http {}: logs JSON, maps (requestId, upgrade, path), includes
  templates/               # lo que cambia por entorno; envsubst al arrancar → /etc/nginx/env.d/
    00-realip.conf.template    # set_real_ip_from ${NGINX_TRUSTED_CIDR} / real_ip_header
    20-upstream.conf.template  # resolver ${NGINX_RESOLVER} + $backend = ${NGINX_BACKEND}
  conf.d/                  # igual en todos los entornos
    10-ratelimit.conf      # limit_req_zone (api, auth) + status 429; `auth` solo la usan login y register
    30-server.conf         # server :8080, /health, /api/v1, /api/v1/socket.io, /admin, 404/429 JSON
  snippets/
    proxy.conf             # reescritura /api/v1 → /internal + headers de proxy
  admin/                   # panel estático (HTML/JS)
  tests/
    smoke.sh               # ver "Tests del front service"
```

Los templates los procesa el entrypoint de la imagen oficial de Nginx (`/etc/nginx/templates/*.template` → `NGINX_ENVSUBST_OUTPUT_DIR`, con `NGINX_ENVSUBST_FILTER=^NGINX_` para que solo se sustituyan nuestras variables). `nginx.conf` incluye primero `/etc/nginx/env.d/*.conf` y después `/etc/nginx/conf.d/*.conf`.

### Variables por entorno

| Variable | Local (`infra/docker-compose.dev.yml`) | AWS |
|----------|----------------------------------------|-----|
| `NGINX_TRUSTED_CIDR` | `172.30.0.128/25` (IPs de los contenedores de la red de compose) | CIDR de la VPC, p. ej. `10.0.0.0/16` |
| `NGINX_RESOLVER` | `127.0.0.11` (DNS embebido de docker) | `169.254.169.253` (DNS de la VPC) |
| `NGINX_BACKEND` | `back:3000` | `<DNS del ALB interno>:3000` |

## Configuración clave

```nginx
# nginx.conf — requestId: siempre $request_id (generado por Nginx); el del cliente se ignora
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

# templates/00-realip.conf.template — ver 02-comunicacion-y-red.md
set_real_ip_from  ${NGINX_TRUSTED_CIDR};
real_ip_header    X-Forwarded-For;
real_ip_recursive on;

# templates/20-upstream.conf.template
# El DNS de un ALB cambia de IPs: con proxy_pass a un nombre fijo, Nginx lo resuelve una sola vez
# al arrancar y termina mandando tráfico a IPs viejas. Con variable + resolver se re-resuelve
# (y `nginx -t` pasa aunque el back no exista).
resolver ${NGINX_RESOLVER} valid=30s ipv6=off;
map $host $backend { default "http://${NGINX_BACKEND}"; }

# conf.d/10-ratelimit.conf  (valores iniciales, a calibrar)
limit_req_zone $binary_remote_addr zone=api:10m  rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_status 429;

# conf.d/30-server.conf
server {
  listen 8080 default_server;
  client_max_body_size 1m;                         # las fotos van directo a S3, no por acá
  absolute_redirect off;
  add_header X-Request-Id $request_id always;          # toda respuesta, incluidos errores
  error_page 429 = @rate_limited;

  location = /health { access_log off; return 200 'ok'; }

  # Solo login y registro (fuerza bruta, altas masivas). refresh, logout y logout-all usan la zona api.
  # Regex insensible a mayúsculas y con barra final opcional: una variante de la URL no cae en la zona general.
  location ~* ^/api/v1/auth/(login|register)/?$ {
    limit_req zone=auth burst=5 nodelay;
    include /etc/nginx/snippets/proxy.conf;
  }

  location /api/v1/socket.io/ {
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    include /etc/nginx/snippets/proxy.conf;
  }

  location /api/v1/ {
    limit_req zone=api burst=20 nodelay;
    include /etc/nginx/snippets/proxy.conf;
  }

  location /admin/ { root /usr/share/nginx/html; try_files $uri $uri/ /admin/index.html; }

  location / {                                     # incluye /internal/*: no se publica
    default_type application/json;
    return 404 '{"code":"NOT_FOUND","message":"Recurso no encontrado","requestId":"$request_id"}';
  }

  location @rate_limited {
    default_type application/json;
    return 429 '{"code":"RATE_LIMITED","message":"Demasiadas solicitudes","requestId":"$request_id"}';
  }
}

# snippets/proxy.conf
rewrite ^/api/v1/(.*)$ /internal/$1 break;
proxy_pass $backend;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_set_header Host $host;
proxy_set_header X-Request-Id $request_id;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_hide_header X-Request-Id;                    # el de la respuesta lo agrega el server
```

> Valores iniciales: ajustar los límites y el CIDR reales. `nginx -t` corre en CI.

### requestId

- Nginx usa **siempre** su `$request_id` (32 hex) y pisa cualquier `X-Request-Id` que mande el cliente: el cliente no elige el id con el que se correlacionan los logs.
- El mismo valor va al back (`X-Request-Id`), a la respuesta (una sola vez), al access log y al body de los errores que genera Nginx.
- El back solo genera uno propio cuando no viene el header, que pasa únicamente sin Nginx (`task back:dev`).

### Logs

Access log en JSON: `time`, `requestId`, `remoteAddr` (IP real), `method`, `path` (**sin query string**: puede traer coordenadas), `upstreamPath` (path reescrito, también sin query), `status`, `bytesSent`, `durationS`, `upstreamStatus`, `upstreamDurationS`, `userAgent`. No se loguean `Authorization`, cookies, bodies ni referer. `server_tokens off`.

## Health checks

- `GET /health` lo responde Nginx: indica que **Nginx** está vivo, no que el back lo esté.
- `GET /internal/health` lo responde Express: 200 si MongoDB (y Redis) responden, 503 si no. Lo usa el ALB interno.
- `/internal/*` **no** se publica hacia afuera: solo se llega pasando por la reescritura de `/api/v1` (Nginx responde 404 JSON a `/internal/*`).

## Panel `/admin`

Estáticos servidos por Nginx; sus llamadas van a `/api/v1/admin/*` con un JWT de un usuario `role: admin`. La autorización la decide Express (`requireRole('admin')`), **no** Nginx. El token del panel se guarda solo en memoria (no en `localStorage`) para reducir el impacto de un XSS.

## Entorno local

`infra/docker-compose.dev.yml` monta `nginx.conf`, `conf.d/`, `snippets/`, `templates/` y `admin/` en la imagen oficial `nginx` (sin imagen propia). La red de compose tiene subred fija (`172.30.0.0/24`) y los contenedores toman IPs de `172.30.0.128/25`: ese rango es el "de confianza" (como el ALB en AWS). El tráfico que entra desde el host por el puerto publicado llega desde fuera de ese rango, así que el host es un cliente externo y su `X-Forwarded-For` se ignora.

- Cambios en `conf.d/` o `snippets/`: `docker compose -f infra/docker-compose.dev.yml exec nginx nginx -s reload`.
- Cambios en `nginx.conf` o `templates/`: `docker compose -f infra/docker-compose.dev.yml restart nginx` (los templates se renderizan al arrancar y Docker Desktop puede mostrar una versión vieja de un archivo montado individualmente hasta reiniciar).

## Tests del front service

- CI: `docker compose -f infra/docker-compose.dev.yml run --rm --no-deps nginx nginx -t` (renderiza los templates y valida; no necesita el back).
- `tests/smoke.sh [base_url]` (por defecto `http://localhost:8080`) contra el entorno levantado con docker compose:
  - `/health` = 200 respondido por Nginx.
  - `X-Request-Id` presente y generado por Nginx; el que manda el cliente no llega al back; el back recibe el de Nginx y la respuesta lo trae una sola vez.
  - `/api/v1/health` llega al back; una ruta inexistente `/api/v1/x` devuelve el 404 del back y el access log muestra `upstreamPath: /internal/x` sin query string; `/internal/*` da 404.
  - Body de más de 1 MB → 413.
  - Ráfaga sobre `/api/v1/auth/login` → 429 JSON `{ code: 'RATE_LIMITED', message, requestId }` con el mismo `requestId` que el header; un `X-Forwarded-For` inventado desde fuera de la red de confianza no evade el límite.
  - La zona estricta es solo de `login` y `register`: con la IP ya bloqueada, `/auth/register` y las variantes de la URL de login (`/auth/Login`, `/auth/LOGIN`, `/auth/login/`) también dan 429, mientras que `/auth/refresh`, `/auth/logout` y `/auth/logout-all` (zona general) siguen respondiendo.
  - Rate limit por IP real: desde un contenedor efímero en la red de compose (red de confianza), una ráfaga con `X-Forwarded-For: A` llega a 429 y un request con `X-Forwarded-For: B` no; el access log registra B como `remoteAddr`.
  - Las verificaciones que leen el access log o usan la red de compose solo corren con `base_url` local (se pueden omitir con `SMOKE_SKIP_LOCAL=1`).
