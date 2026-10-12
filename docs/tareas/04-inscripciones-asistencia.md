# Sprint 4 · Inscripciones, asistencia y reputación

**Objetivo:** el corazón transaccional: cupos siempre consistentes y asistencia verificada.

**Entregable:** altas y bajas con transacción, QR con desafío, check-in con ubicación y horario, reputación y `noShow` escritos solo por el back.

**Decidido:** [parámetros del check-in](../pendientes.md#parámetros-del-check-in), [estados del plan](../pendientes.md#estados-del-plan), [reactivación](../pendientes.md#reactivación-de-inscripciones) y [jobs](../pendientes.md#jobs-programados), en [s4-decisiones.md](s4-decisiones.md).

## Back service

Decisiones del sprint en [s4-decisiones.md](s4-decisiones.md).

- [x] **S4-BE-01 · `POST /plans/:id/join`** con `incrementIfCapacity` + activación en una transacción ([patrón](../arquitectura/07-modelo-de-datos.md#transacciones)); E11000 → `ALREADY_JOINED`; motivo exacto del fallo (404 / `PLAN_FULL` / `PLAN_CLOSED`). Con cupo ilimitado (`capacity: null`) nunca responde `PLAN_FULL`.
  *Acepta:* test de concurrencia de [testing.md](../practicas/testing.md#ejemplo-test-de-concurrencia) en verde, y otro con un plan de cupo ilimitado (N inscripciones simultáneas → N exitosas).
- [x] **S4-BE-02 · `DELETE /plans/:id/join`**: decrementa y cancela en una transacción; idempotente (204 si no estaba); 409 si ya no admite bajas (plan empezado, cancelado o completado, o check-in ya hecho).
- [x] **S4-BE-03 · Reactivación** de inscripción cancelada: mismas reglas que la primera inscripción, mismo registro.
- [x] **S4-BE-04 · `POST /plans/:id/qr`**: solo creador, dentro de la ventana; nonce de 32 bytes, guarda `qrNonceHash` + `qrExpiresAt` (90 s). Al renovarlo, el anterior vale 10 segundos más.
- [x] **S4-BE-05 · Funciones puras** `haversineMeters` y `isWithinWindow` con tests de bordes (exactamente en el radio, un segundo antes de abrir).
- [x] **S4-BE-06 · `POST /plans/:id/check-in`**: inscripción activa, ventana, QR (`timingSafeEqual`, vencimiento, plan correcto), distancia y precisión; inserta `checkIn` (sin coordenadas) **y** `reputation +1` en una transacción. El creador inscripto entra sin QR y su +1 se resuelve al cerrar la asistencia.
  *Acepta:* todos los casos de "Check-in" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí).
- [x] **S4-BE-07 · Cierre de asistencia y de planes**: al cerrar la ventana de check-in, `noShow` en las inscripciones activas sin check-in y +1 del creador si corresponde, una sola vez por plan; `completed` al llegar `endsAt`. Cerrar inscripciones (`closed`) no marca `noShow`.
- [x] **S4-BE-08 · Scheduler con lock en Redis** (base para cierre automático y recordatorios).
  *Acepta:* con dos instancias levantadas, el job corre una sola vez por ciclo. *(Cubierto con dos schedulers sobre un Redis simulado; falta la prueba con docker-compose.)*
- [x] **S4-BE-09 · Estados del plan**: `PATCH /plans/:id { status }` para cerrar y reabrir inscripciones (antes de `startsAt`) y cancelar (hasta `endsAt`).
- [x] **S4-BE-10 · `GET /plans/:id/participants`**: anotados con reputación, solo para participantes activos y el creador.
- [x] **S4-BE-11 · `GET /users/me/plans`** (creados / inscriptos, próximos / pasados), `noShowCount` en `GET /users/me` y `reputation` en la vista pública del usuario.
- [x] **S4-BE-13 · Feed sin planes propios ni inscriptos**: `GET /plans` y `POST /feed` excluyen los planes que creó el usuario y aquellos en los que tiene inscripción activa.
- [x] **S4-BE-12 · Migraciones**: ventana y radio de check-in en los planes existentes, validador de `plans`, método `location` en `checkIns`.

## App

- [x] **S4-MOB-01 · Inscribirse / darse de baja** desde PlanScreen; la UI se actualiza **cuando el servidor confirma**; mensajes por `code`. Lista de anotados con su reputación. El detalle se refresca solo cuando abre el horario de asistencia y al volver la app a primer plano.
- [x] **S4-MOB-02 · Pantalla del creador con QR** (`react-native-qrcode-svg`) que se regenera antes de vencer y mantiene la pantalla encendida. El creador inscripto registra ahí su asistencia.
- [x] **S4-MOB-03 · CheckInScreen**: cámara (`expo-camera`) + ubicación con precisión; explica cada rechazo (fuera de radio, QR vencido, fuera de horario).
- [x] **S4-MOB-04 · "Mis planes"**: creados e inscriptos, próximos y pasados; reputación y ausencias propias en el perfil.

El aviso de cupo liberado (antes S4-BE-09 y S4-MOB-05) pasó completo al [sprint 5](05-chat-y-notificaciones.md).

## Pruebas obligatorias

Bloques "Cupos (concurrencia)" y "Check-in" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí). Este sprint no se cierra sin el test de concurrencia en CI.
