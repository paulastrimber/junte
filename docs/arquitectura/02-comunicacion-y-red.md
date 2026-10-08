# 02 · Comunicación y red

## Protocolos y puertos

| Tramo | Protocolo / puerto | Uso |
|-------|-------------------|-----|
| App → ALB público | HTTPS 443 | REST + JSON |
| App → ALB público | WSS 443 | Socket.io (solo transporte WebSocket, ver [ADR-0003](adr/0003-socketio-solo-websocket.md)); polling REST como fallback |
| ALB público → Nginx | HTTP 8080 | REST, WebSocket, health check `/health` |
| Nginx → ALB interno | HTTP 3000 | Tráfico privado hacia la capa de aplicación |
| ALB interno → back service | HTTP 3000 | Distribución entre instancias Express; health check `/internal/health` |
| Back → Redis | TCP 6379 | Adaptador Socket.io (+ locks de jobs) |
| Back → MongoDB | TCP 27017 | Protocolo nativo |
| App → S3 | HTTPS 443 | Solo con URL firmada emitida por el back |
| Back → FCM / servicios AWS | HTTPS 443 | Vía NAT por AZ o VPC endpoints |

TLS termina en el ALB público. Los tramos internos van por HTTP en subredes privadas: **eso no es cifrado**. Para producción real se recomienda TLS también internamente (Nginx, ALB interno, Redis, MongoDB). Se documenta como límite del alcance académico.

## Matriz de Security Groups

Cadena: `sg-alb → sg-front → sg-alb-interno → sg-back → {sg-redis, sg-db}`.

| Origen | Destino | Puerto | Regla |
|--------|---------|--------|-------|
| 0.0.0.0/0 | `sg-alb` | 443 | Única entrada desde Internet |
| `sg-alb` | `sg-front` | 8080 | Único origen hacia Nginx |
| `sg-front` | `sg-alb-interno` | 3000 | Único origen hacia el ALB interno |
| `sg-alb-interno` | `sg-back` | 3000 | Único origen hacia Express |
| `sg-back` | `sg-redis` | 6379 | Exclusivo |
| `sg-back` | `sg-db` | 27017 | Exclusivo |
| `sg-db` | `sg-db` | 27017 | Replicación entre nodos del replica set |
| Internet | cualquier EC2 | 22 | **Cerrado**. Administración por Session Manager |

Las reglas de entrada tienen que tener su regla de salida correspondiente en el SG de origen.

## IP real del cliente (`X-Forwarded-For`)

Con el ALB público delante, Nginx ve como `$remote_addr` la IP **del balanceador**. Si el rate limiting usa esa IP, el límite se aplica a todos los usuarios juntos y un pico de tráfico tumba a todos.

Solución obligatoria en Nginx:

```nginx
set_real_ip_from 10.0.0.0/16;      # CIDR de la VPC (ajustar al real)
real_ip_header   X-Forwarded-For;
real_ip_recursive on;
```

Solo se confía en `X-Forwarded-For` cuando viene de una IP de la VPC (el ALB). Un cliente que manda su propio `X-Forwarded-For` no puede falsear la IP, porque el ALB agrega la real al final y `real_ip_recursive` descarta las direcciones de confianza desde la derecha. Detalle en [04-front-service.md](04-front-service.md).

## Socket.io detrás de dos ALB

El handshake por defecto de Socket.io arranca con long-polling HTTP y necesita volver a la **misma instancia**. Con dos balanceadores en el camino eso no está garantizado.

**Decisión** ([ADR-0003](adr/0003-socketio-solo-websocket.md)): el cliente fuerza `transports: ['websocket']`. Una conexión WebSocket es una sola conexión TCP que queda fija a una instancia, así que **no se habilita stickiness** en los target groups. Redis distribuye los eventos entre instancias.

## Timeouts de conexiones largas

| Elemento | Valor | Por qué |
|----------|-------|---------|
| Idle timeout ALB público | **300 s** | El default (60 s) puede cortar WebSockets ociosos |
| Idle timeout ALB interno | **300 s** | Ídem |
| Nginx `proxy_read_timeout` / `proxy_send_timeout` en Socket.io | 300 s | Coherente con los ALB |
| Socket.io `pingInterval` / `pingTimeout` | 25 s / 20 s (default) | Mantiene viva la conexión por debajo de cualquier timeout |

Regla: **el timeout de una capa interna nunca puede ser menor que el de la capa externa**, si no la interna corta primero y el error es difícil de diagnosticar.

## Salida a Internet (NAT)

El back necesita salida para FCM, dependencias y servicios AWS sin VPC endpoint. **Decisión** ([ADR-0005](adr/0005-nat-por-zona.md)): **un NAT Gateway por zona de disponibilidad**, con la tabla de rutas de cada subred privada apuntando al NAT de su misma zona. Un único NAT sería un punto único de falla: si cae su zona, todas las subredes privadas pierden salida (y con ella las notificaciones push).

Se usan VPC endpoints para S3 (gateway endpoint, sin costo), Secrets Manager y CloudWatch Logs cuando sea posible, para que ese tráfico no dependa del NAT.

## Formato de datos

- JSON (`application/json`) en request y response.
- Fechas ISO 8601 con zona horaria.
- IDs como strings.
- Nombres de campos en inglés.
- Coordenadas GeoJSON `[longitud, latitud]`.
