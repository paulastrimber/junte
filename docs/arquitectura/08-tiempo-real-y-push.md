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

1. Middleware `io.use()` verifica el access token igual que el middleware HTTP (firma, algoritmo, `exp`, `typ: 'access'`, usuario `active`; es el mismo `authService.authenticate`). Si falla → `connect_error` con `err.message` y `err.data = { code, message }`, donde `code` es `UNAUTHENTICATED`, `TOKEN_EXPIRED` (la app refresca y reconecta) o `ACCOUNT_SUSPENDED`.
2. El token vence durante la conexión: el cliente, al refrescar el token, reconecta con el nuevo. El servidor no expulsa conexiones abiertas por vencimiento (límite aceptado); sí al recibir un evento verifica que el usuario siga `active` (si no, responde `ACCOUNT_SUSPENDED` o `UNAUTHENTICATED` y cierra la conexión).
3. `chat:join { planId }` → el **servicio** verifica participante activo o creador → `socket.join('plan:<id>')`. Si no, ack con `FORBIDDEN` (o `NOT_FOUND` si el plan no le es visible).
4. Cada socket entra además a la sala `user:<id>`. Al darse de baja de un plan, el servicio de inscripciones (después del commit) saca de `plan:<id>` a todos los sockets de ese usuario, en cualquier instancia (`io.in('user:<id>').socketsLeave('plan:<id>')` con el adaptador de Redis). El creador nunca sale.

### Eventos

| Evento | Dirección | Payload | Ack / efecto |
|--------|-----------|---------|--------------|
| `chat:join` | C → S | `{ planId }` | `{ ok }` o `{ error: { code, message } }` |
| `chat:leave` | C → S | `{ planId }` | `{ ok }` |
| `chat:send` | C → S | `{ planId, text, clientId }` | `{ ok, message }`; persiste y emite `chat:message` a la sala |
| `chat:message` | S → C | mensaje serializado | — |
| `chat:hidden` | S → C | `{ planId, messageId }` | Un admin ocultó un mensaje (S6): la app lo saca de la lista. Volver a mostrarlo no emite nada (aparece al recargar el historial) |

- **Suspensión (S6):** cuando un admin suspende una cuenta, además de cerrar sus sesiones se cierran todas sus conexiones en todas las instancias (`io.in('user:<id>').disconnectSockets(true)`); al reconectar, el handshake la rechaza con `ACCOUNT_SUSPENDED`. Cierra el punto de [pendientes · H](../pendientes.md#h-notas-del-sprint-5-chat) para la suspensión (no para `logout`/`logout-all`, que sigue igual).
- **Segundo plano (S6-MOB-04):** con la app en segundo plano la app suelta la sala (y, si era la última, la conexión) y no hace polling; al volver se reconecta y recupera el historial.

- `chat:send` usa **acknowledgements** y un `clientId` generado en el teléfono para que un reintento no duplique el mensaje (idempotencia): un reintento responde `{ ok, message }` con el mensaje ya creado y no se vuelve a emitir. El mismo `clientId` sirve para el fallback por REST.
- Mismo servicio y mismas validaciones que `POST /plans/:id/messages`: los handlers de socket son solo otro "controlador". `chat:message` es el mismo JSON que devuelve REST ([06](06-api.md#chat)) y llega también a quien lo mandó (la app fusiona por `id`/`clientId`). Un mensaje enviado por REST también se emite a la sala.
- **Errores por ack:** `{ error: { code, message, requestId, details? } }`, con los mismos `code` del [catálogo](../practicas/errores-y-logs.md) (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `ACCOUNT_SUSPENDED`, `INTERNAL`…). El `requestId` se genera por evento y es el del log.
- **Logs:** una línea por evento con `event`, `requestId`, `userId`, `planId`, estado y duración; nunca el texto del mensaje.
- Payload máximo de un evento: 16 KB (`maxHttpBufferSize`).

### Recuperación

Al reconectar, el cliente vuelve a hacer `chat:join` (las salas no sobreviven a una desconexión), pide `GET /plans/:id/messages` y fusiona por `id`. Si el WebSocket falla repetidamente, cae a polling de ese mismo endpoint cada 5 segundos y envía por `POST /plans/:id/messages` con el mismo `clientId`.

### Varias instancias

`@socket.io/redis-adapter` (`src/adapters/socketAdapter.js`) usa la conexión de Redis del back para publicar y una copia para suscribirse: un `emit` a `plan:<id>` llega a los clientes conectados a cualquier instancia. Se prueba con `task chat:two-instances` (segunda instancia del back en docker-compose, perfil `scale`, puerto 3001). Si Redis cae, cada instancia solo emite a sus propios clientes y el resto se entera por el polling REST.

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
