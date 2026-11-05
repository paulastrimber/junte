# Sprint 5 · Chat y notificaciones

**Objetivo:** comunicación en tiempo real por plan y avisos push confiables.

**Entregable:** chat con Socket.io + Redis entre instancias y fallback REST, historial tras desconexión, push FCM probado en dispositivo.

**Decidido:** [notas de voz y contactos](../pendientes.md#notas-de-voz-y-contactos) (2026-10-14: propuesta aprobada, se implementa después del chat de texto) y el [aviso de cupo liberado](../pendientes.md#aviso-de-cupo-liberado) (2026-10-12). Notas del chat en [pendientes · H](../pendientes.md#h-notas-del-sprint-5-chat).

## Back service

- [x] **S5-BE-01 · Servicio de mensajes** compartido por REST y Socket.io: permiso (participante activo o creador), texto 1–2000, `senderId` del token, `status: 'visible'`.
- [x] **S5-BE-02 · `GET /plans/:id/messages`** paginado por `{ createdAt, _id }` descendente; solo `visible` para usuarios comunes.
- [x] **S5-BE-03 · `POST /plans/:id/messages`** (fallback y para clientes sin WebSocket).
- [x] **S5-BE-04 · Socket.io** en `/internal/socket.io`, `transports: ['websocket']`, auth en handshake, `@socket.io/redis-adapter`.
- [x] **S5-BE-05 · Eventos** `chat:join`, `chat:leave`, `chat:send` (ack + `clientId` idempotente), `chat:message` ([08](../arquitectura/08-tiempo-real-y-push.md#eventos)).
  *Acepta:* test con dos instancias del back en docker-compose: un mensaje enviado a la instancia A llega a un cliente conectado a la B. *(`task chat:two-instances` corrido OK el 2026-10-14, en los dos sentidos.)*
- [x] **S5-BE-06 · `POST /devices` y `DELETE /devices/:token`** (upsert por token, reasignación de usuario).
- [x] **S5-BE-07 · Adapter FCM + `notifier`**: envío después del commit, sin bloquear la respuesta; borra tokens inválidos.
- [x] **S5-BE-08 · Avisos**: nuevo inscripto (al creador), recordatorio (job con lock + `reminderSentAt`) y **cupo liberado**: push a **todos** los que pidieron aviso en ese plan (`spotAlerts`, S5-BE-10); el primero que se inscribe se queda con el lugar. Definir qué pasa con los pedidos después de avisar (propuesta: se conservan hasta que el usuario se inscribe, cancela el aviso o el plan empieza).
- [x] **S5-BE-09 · Notas de voz** (según decisión): `type: 'voice'` + `audioKey` vía presign.
- [x] **S5-BE-10 · Aviso de cupo liberado (pedido)** ([diseño](../pendientes.md#aviso-de-cupo-liberado); pasó de S4 a S5 el 2026-10-12): colección `spotAlerts` (`planId`, `userId`; índice único `{ planId, userId }`, por migración), `PUT` y `DELETE /plans/:id/spot-alert` (idempotentes, identidad del token; solo sobre un plan lleno y abierto) y `spotAlertRequested` en el detalle. Ganchos en el servicio de inscripciones de S4: al inscribirse se borra el pedido de ese usuario; al darse de baja alguien, **después del commit**, se dispara el aviso (S5-BE-08).
  *Acepta:* dos pedidos del mismo usuario → uno solo; pedir aviso en un plan con cupo → 409; un plan de cupo ilimitado nunca admite pedidos. *(2026-11-04: `tests/contract/spot-alerts.test.js`, `spot-alert.service.test.js`; notifier después del commit y no si la transacción falla: `participation.service.test.js`; tokens inválidos borrados y recordatorio idempotente (también con dos ejecuciones simultáneas): `tests/contract/notifications.test.js`; notas de voz: `tests/contract/voice-messages.test.js`. Decisiones en [pendientes · H](../pendientes.md#s5-push-aviso-de-cupo-y-notas-de-voz-2026-11-04).)*

## Front service

- [ ] **S5-NG-01 · WebSocket a través de Nginx y ambos ALB**: `Upgrade`/`Connection`, `proxy_read_timeout 300s`.
  *Acepta:* una conexión ociosa 5 minutos sigue viva en AWS. *(Nginx ya tenía el upgrade y los 300 s; `smoke.sh` ahora verifica el upgrade y que el long-polling esté rechazado, corrido OK en local el 2026-10-14. Falta la prueba en AWS, a cargo del equipo de AWS.)*

## App

- [x] **S5-MOB-01 · `services/socket.js`**: conexión con token, reconexión con token nuevo tras refresh, recuperación de historial por REST, fallback a polling.
- [x] **S5-MOB-02 · ChatScreen**: `FlatList` invertida, envío con estado "pendiente" hasta el ack, paginación hacia atrás.
- [x] **S5-MOB-03 · `services/push.js`**: permiso, `getDevicePushTokenAsync()` (token FCM nativo), registro en `/devices`, baja al cerrar sesión, apertura del plan al tocar la notificación.
- [ ] **S5-MOB-04 · Development build** con `google-services.json` y prueba en teléfono real. *(Preparado el 2026-11-04: proyecto Firebase `junte-ebef4` con la app Android `com.junte.app`, `mobile/google-services.json` local e ignorado, `app.config.js` lo lee o toma `GOOGLE_SERVICES_JSON` de EAS. Falta cargar la variable en EAS, compilar y probar en un teléfono.)*
- [x] **S5-MOB-05 · Notas de voz / contactos** según decisión.
- [x] **S5-MOB-06 · "Avisarme si se libera un lugar"** en el detalle de un plan lleno (pedir y cancelar el aviso). Pasó de S4 a S5.

## Pruebas obligatorias

Bloque "Chat y reportes" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí); no participante rechazado por REST **y** por socket.
