# Sprint 5 · Chat y notificaciones

**Objetivo:** comunicación en tiempo real por plan y avisos push confiables.

**Entregable:** chat con Socket.io + Redis entre instancias y fallback REST, historial tras desconexión, push FCM probado en dispositivo.

**Decidir antes:** [cupo liberado](../pendientes.md#aviso-de-cupo-liberado), [notas de voz y contactos](../pendientes.md#notas-de-voz-y-contactos).

## Back service

- [ ] **S5-BE-01 · Servicio de mensajes** compartido por REST y Socket.io: permiso (participante activo o creador), texto 1–2000, `senderId` del token, `status: 'visible'`.
- [ ] **S5-BE-02 · `GET /plans/:id/messages`** paginado por `{ createdAt, _id }` descendente; solo `visible` para usuarios comunes.
- [ ] **S5-BE-03 · `POST /plans/:id/messages`** (fallback y para clientes sin WebSocket).
- [ ] **S5-BE-04 · Socket.io** en `/internal/socket.io`, `transports: ['websocket']`, auth en handshake, `@socket.io/redis-adapter`.
- [ ] **S5-BE-05 · Eventos** `chat:join`, `chat:leave`, `chat:send` (ack + `clientId` idempotente), `chat:message` ([08](../arquitectura/08-tiempo-real-y-push.md#eventos)).
  *Acepta:* test con dos instancias del back en docker-compose: un mensaje enviado a la instancia A llega a un cliente conectado a la B.
- [ ] **S5-BE-06 · `POST /devices` y `DELETE /devices/:token`** (upsert por token, reasignación de usuario).
- [ ] **S5-BE-07 · Adapter FCM + `notifier`**: envío después del commit, sin bloquear la respuesta; borra tokens inválidos.
- [ ] **S5-BE-08 · Avisos**: nuevo inscripto (al creador), recordatorio (job con lock + `reminderSentAt`), cupo liberado (según decisión).
- [ ] **S5-BE-09 · Notas de voz** (según decisión): `type: 'voice'` + `audioKey` vía presign.

## Front service

- [ ] **S5-NG-01 · WebSocket a través de Nginx y ambos ALB**: `Upgrade`/`Connection`, `proxy_read_timeout 300s`.
  *Acepta:* una conexión ociosa 5 minutos sigue viva en AWS.

## App

- [ ] **S5-MOB-01 · `services/socket.js`**: conexión con token, reconexión con token nuevo tras refresh, recuperación de historial por REST, fallback a polling.
- [ ] **S5-MOB-02 · ChatScreen**: `FlatList` invertida, envío con estado "pendiente" hasta el ack, paginación hacia atrás.
- [ ] **S5-MOB-03 · `services/push.js`**: permiso, `getDevicePushTokenAsync()` (token FCM nativo), registro en `/devices`, baja al cerrar sesión, apertura del plan al tocar la notificación.
- [ ] **S5-MOB-04 · Development build** con `google-services.json` y prueba en teléfono real.
- [ ] **S5-MOB-05 · Notas de voz / contactos** según decisión.

## Pruebas obligatorias

Bloque "Chat y reportes" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí); no participante rechazado por REST **y** por socket.
