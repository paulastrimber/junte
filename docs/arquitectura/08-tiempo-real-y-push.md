# 08 · Tiempo real (Socket.io) y notificaciones (FCM)

## Socket.io

### Conexión

```
App ──WSS /api/v1/socket.io──▶ ALB público ──▶ Nginx (rewrite) ──▶ ALB interno ──▶ Express /internal/socket.io
```

- Cliente: `io(API_URL, { path: '/api/v1/socket.io', transports: ['websocket'], auth: { token } })`.
- Servidor: `new Server(httpServer, { path: '/internal/socket.io', transports: ['websocket'] })` + `@socket.io/redis-adapter`.
- Sin stickiness en los ALB ([ADR-0003](adr/0003-socketio-solo-websocket.md)); idle timeout de 300 s en ambos ([02](02-comunicacion-y-red.md#timeouts-de-conexiones-largas)).

### Autenticación y autorización

1. Middleware `io.use()` verifica el access token igual que el middleware HTTP (firma, algoritmo, `exp`, `typ: 'access'`, usuario `active`). Si falla → `connect_error` con `code: 'UNAUTHENTICATED'`.
2. El token vence durante la conexión: el cliente, al refrescar el token, reconecta con el nuevo. El servidor no expulsa conexiones abiertas por vencimiento (límite aceptado); sí al recibir un evento verifica que el usuario siga `active`.
3. `chat:join { planId }` → el **servicio** verifica participante activo o creador → `socket.join('plan:<id>')`. Si no, ack con `FORBIDDEN`.

### Eventos

| Evento | Dirección | Payload | Ack / efecto |
|--------|-----------|---------|--------------|
| `chat:join` | C → S | `{ planId }` | `{ ok }` o `{ error: { code, message } }` |
| `chat:leave` | C → S | `{ planId }` | `{ ok }` |
| `chat:send` | C → S | `{ planId, text, clientId }` | `{ ok, message }`; persiste y emite `chat:message` a la sala |
| `chat:message` | S → C | mensaje serializado | — |
| `chat:hidden` | S → C | `{ messageId }` | Un admin ocultó un mensaje |

- `chat:send` usa **acknowledgements** y un `clientId` generado en el teléfono para que un reintento no duplique el mensaje (idempotencia).
- Mismo servicio y mismas validaciones que `POST /plans/:id/messages`: los handlers de socket son solo otro "controlador".

### Recuperación

Al reconectar, el cliente pide `GET /plans/:id/messages` y fusiona por `id`. Si el WebSocket falla repetidamente, cae a polling cada N segundos.

## Notificaciones push (FCM)

### Registro de dispositivos

- `POST /devices { token, platform }` después del login y cada vez que el token cambia.
- `DELETE /devices/:token` al cerrar sesión.
- Respuesta de FCM `registration-token-not-registered` / `invalid-argument` → el back borra ese token.

### Avisos que dispara el back

| Aviso | Disparador | Destinatarios |
|-------|-----------|---------------|
| Nuevo inscripto | `join` confirmado | Creador del plan |
| Cupo liberado | `leave` confirmado en un plan que estaba lleno | Pendiente: ¿a quién? (no hay lista de espera) |
| Recordatorio | Job programado X min antes de `startsAt` | Participantes activos |

Reglas:
- Se envían **después del commit** de la transacción y nunca bloquean la respuesta HTTP.
- Un fallo de FCM se loguea y no rompe la operación de negocio.
- El contenido del push no lleva datos sensibles (ni ubicación ni texto completo del chat).

### Jobs programados

Con 2+ instancias del back, un `setInterval` correría duplicado. Los jobs (recordatorios, cierre automático de planes) toman un **lock en Redis** (`SET key value NX PX ttl`) antes de ejecutar; solo la instancia que lo obtiene trabaja. Marcar en Mongo qué recordatorio ya se envió (`reminderSentAt`) para que un reinicio no los repita. Ver [pendientes](../pendientes.md#jobs-programados).
