# Sprint 4 · Inscripciones, asistencia y reputación

**Objetivo:** el corazón transaccional: cupos siempre consistentes y asistencia verificada.

**Entregable:** altas y bajas con transacción, QR con desafío, check-in con ubicación y horario, reputación y `noShow` escritos solo por el back.

**Decidir antes:** [parámetros del check-in](../pendientes.md#parámetros-del-check-in), [estados del plan](../pendientes.md#estados-del-plan), [reactivación](../pendientes.md#reactivación-de-inscripciones), [jobs](../pendientes.md#jobs-programados).

## Back service

- [ ] **S4-BE-01 · `POST /plans/:id/join`** con `incrementIfCapacity` + activación en una transacción ([patrón](../arquitectura/07-modelo-de-datos.md#transacciones)); E11000 → `ALREADY_JOINED`; motivo exacto del fallo (404 / `PLAN_FULL` / `PLAN_CLOSED`).
  *Acepta:* test de concurrencia de [testing.md](../practicas/testing.md#ejemplo-test-de-concurrencia) en verde.
- [ ] **S4-BE-02 · `DELETE /plans/:id/join`**: decrementa y cancela en una transacción; idempotente (204 si no estaba); 409 si ya no admite bajas.
- [ ] **S4-BE-03 · Reactivación** de inscripción cancelada según la regla acordada.
- [ ] **S4-BE-04 · `POST /plans/:id/qr`**: solo creador, dentro de la ventana; nonce de 32 bytes, guarda `qrNonceHash` + `qrExpiresAt`.
- [ ] **S4-BE-05 · Funciones puras** `haversineMeters` y `isWithinWindow` con tests de bordes (exactamente en el radio, un segundo antes de abrir).
- [ ] **S4-BE-06 · `POST /plans/:id/check-in`**: inscripción activa, ventana, QR (`timingSafeEqual`, vencimiento, plan correcto), distancia y precisión; inserta `checkIn` (sin coordenadas) **y** `reputation +1` en una transacción.
  *Acepta:* todos los casos de "Check-in" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí).
- [ ] **S4-BE-07 · Cierre del plan**: transición a `closed`/`completed` que marca `noShow` en inscripciones activas sin check-in, en la misma operación.
- [ ] **S4-BE-08 · Scheduler con lock en Redis** (base para cierre automático y recordatorios).
  *Acepta:* con dos instancias levantadas, el job corre una sola vez por ciclo.

## App

- [ ] **S4-MOB-01 · Inscribirse / darse de baja** desde PlanScreen; la UI se actualiza **cuando el servidor confirma**; mensajes por `code`.
- [ ] **S4-MOB-02 · Pantalla del creador con QR** (`react-native-qrcode-svg` o similar) que se regenera antes de vencer.
- [ ] **S4-MOB-03 · CheckInScreen**: cámara (`expo-camera`) + ubicación con precisión; explica cada rechazo (fuera de radio, QR vencido, fuera de horario).
- [ ] **S4-MOB-04 · "Mis planes"**: creados e inscriptos; reputación en el perfil.

## Pruebas obligatorias

Bloques "Cupos (concurrencia)" y "Check-in" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí). Este sprint no se cierra sin el test de concurrencia en CI.
