# 04 · Front service (capa 3 · Borde)

Nginx como proxy inverso. **No ejecuta reglas de negocio, no valida JWT como autoridad y no accede a MongoDB ni a Redis.**

## Responsabilidades

| Hace | No hace |
|------|---------|
| Publica `/api/v1/*` y lo reescribe a `/internal/*` | Decidir permisos |
| Obtiene la IP real del cliente (`X-Forwarded-For`) | Validar cuerpos o tokens |
| Rate limiting por IP real y límite de tamaño de body | Guardar estado |
| Genera `requestId` y lo reenvía como `X-Request-Id` | Hablar con MongoDB o Redis |
| Proxy de WebSocket para Socket.io | |
| Responde `GET /health` (puerto 8080) al ALB público | |
| Sirve los estáticos de `/admin` | |
| Devuelve 429 en formato `{ code, message, requestId }` | |

## Estructura

```
front-service/
  nginx.conf               # http {}: logs, map, zonas de rate limit, include conf.d/*.conf
  conf.d/
    00-realip.conf         # set_real_ip_from / real_ip_header
    10-ratelimit.conf      # limit_req_zone + respuesta 429 JSON
    20-upstream.conf       # resolver + variable con el DNS del ALB interno
    30-server.conf         # server :8080, /health, /api/v1, /api/v1/socket.io, /admin
  admin/                   # panel estático (HTML/JS)
  tests/
    smoke.sh               # verifica /health, X-Request-Id, 429, proxy a /internal
```

## Configuración clave

```nginx
# 00-realip.conf — ver 02-comunicacion-y-red.md
set_real_ip_from 10.0.0.0/16;
real_ip_header   X-Forwarded-For;
real_ip_recursive on;

# 10-ratelimit.conf  (valores iniciales, a calibrar)
limit_req_zone $binary_remote_addr zone=api:10m  rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_status 429;

# 20-upstream.conf
# El DNS de un ALB cambia de IPs: con proxy_pass a un nombre fijo, Nginx lo resuelve una sola vez
# al arrancar y termina mandando tráfico a IPs viejas. Con variable + resolver se re-resuelve.
resolver 169.254.169.253 valid=30s;              # DNS de la VPC
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

# 30-server.conf
server {
  listen 8080;
  client_max_body_size 1m;                         # las fotos van directo a S3, no por acá
  set $backend http://${INTERNAL_ALB_DNS}:3000;    # se sustituye con envsubst al desplegar

  location = /health { access_log off; return 200 'ok'; }

  location /api/v1/auth/ {
    limit_req zone=auth burst=5 nodelay;
    include snippets/proxy.conf;
  }

  location /api/v1/socket.io/ {
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    include snippets/proxy.conf;
  }

  location /api/v1/ {
    limit_req zone=api burst=20 nodelay;
    include snippets/proxy.conf;
  }

  location /admin/ { root /usr/share/nginx/html; try_files $uri $uri/ /admin/index.html; }

  error_page 429 = @rate_limited;
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
proxy_set_header X-Request-Id $request_id;         # pisa cualquier X-Request-Id del cliente
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
add_header X-Request-Id $request_id always;
```

> Es una base de referencia: validar con `nginx -t` y ajustar el CIDR, los límites y el DNS reales.

## Health checks

- `GET /health` lo responde Nginx: indica que **Nginx** está vivo, no que el back lo esté.
- `GET /internal/health` lo responde Express: 200 si MongoDB (y Redis) responden, 503 si no. Lo usa el ALB interno.
- `/internal/*` **no** se publica hacia afuera: solo se llega pasando por la reescritura de `/api/v1`.

## Panel `/admin`

Estáticos servidos por Nginx; sus llamadas van a `/api/v1/admin/*` con un JWT de un usuario `role: admin`. La autorización la decide Express (`requireRole('admin')`), **no** Nginx. El token del panel se guarda solo en memoria (no en `localStorage`) para reducir el impacto de un XSS.

## Tests del front service

- CI: `nginx -t` sobre la config generada.
- `tests/smoke.sh` contra el entorno levantado con docker-compose: `/health` = 200, toda respuesta trae `X-Request-Id`, una ráfaga sobre `/api/v1/auth/login` termina en 429 JSON, `/api/v1/plans` llega al back como `/internal/plans`.
