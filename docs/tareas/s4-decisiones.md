# Sprint 4 · Decisiones

Decisiones tomadas con Paula el 2026-10-12 para implementar el [sprint 4](04-inscripciones-asistencia.md). Cierran los cuatro puntos de "Decidir antes" de la tarea ([pendientes](../pendientes.md): parámetros del check-in, estados del plan, reactivación de inscripciones, jobs programados) y lo que no estaba definido en el informe ni en `docs/`.

**Estado:** implementado en la rama `feat/s4-inscripciones-asistencia-reputacion` (2026-10-12). Lo que cambió al implementar respecto de este documento está marcado con **⟳**; las notas del sprint están en [pendientes](../pendientes.md#g-notas-del-sprint-4-inscripciones-asistencia-y-reputación).

Leyenda: ✅ decidido por Paula · ◻ resuelto con la opción más chica para no bloquear; se puede cambiar sin tocar el resto, **confirmar al revisar**.

## 1. Resumen de lo que cambia respecto de los docs actuales

| Tema | Hoy en docs | Decisión |
|------|-------------|----------|
| `noShow` | Se marca al pasar el plan a `closed` o `completed` (regla 5, invariante 5) | Lo marca **solo el job**, al cerrar la ventana de check-in. `closed` no marca nada |
| `completed` | "Al terminar la ventana de check-in" (propuesta) | Al llegar `endsAt` |
| Ventana de check-in | `startsAt − 15 min` a `startsAt + 60 min` (propuesta) | Igual, pero nunca pasa de `endsAt` |
| Reputación del creador | +1 en la misma transacción que el check-in (regla 4) | El creador no suma al hacer check-in: el job le da +1 al cerrar la ventana si hubo al menos 2 check-ins de otros |
| `qrToken` en el check-in | Obligatorio | Obligatorio salvo para el creador inscripto |
| Transiciones | `open → closed → completed`, `open → cancelled` | Se suma `closed → open` y `closed → cancelled`; cancelar se permite hasta `endsAt` |
| Vista pública del usuario | `id`, `name`, `photoUrl` | Suma `reputation` |
| Endpoints | — | Nuevos: `GET /plans/:id/participants`, `GET /users/me/plans` |
| Aviso de cupo liberado | Ganchos en S4, envío en S5 | **Todo en S5** |

## 2. Inscripción (`POST /plans/:id/join`)

- ✅ Se puede inscribir si el plan está `open`, hay cupo y **no empezó** (`now < startsAt`). Vale igual para la primera inscripción y para volver a inscribirse.
- ✅ **Reactivación:** quien se dio de baja puede volver con las mismas condiciones. Se reutiliza el mismo registro de `planParticipants` (uno por par plan–usuario): pasa a `active`, `joinedAt` = ahora, se quita `cancelledAt`.
- El creador no ocupa cupo al crear el plan; si quiere participar se inscribe como cualquiera (ya definido en el informe).
- Transacción: `incrementIfCapacity` (condición y `$inc` en una sola operación) + activación de la inscripción. Si ya estaba activa, el índice único da E11000 → `ALREADY_JOINED` y se revierte el `$inc`.
- Motivo del rechazo, en este orden: no existe o no es visible → 404 `NOT_FOUND`; no está `open` o ya empezó → 409 `PLAN_CLOSED`; sin cupo → 409 `PLAN_FULL`; inscripción activa → 409 `ALREADY_JOINED`.
- ◻ Respuesta 201: `{ planId, status: 'active', joinedAt }`. La app vuelve a pedir el detalle para actualizar los cupos.

## 3. Baja (`DELETE /plans/:id/join`)

- ✅ Se permite con el plan `open` **o `closed`**, mientras no haya empezado. Libera el cupo.
- ✅ No se permite (409 `PLAN_CLOSED`) si el plan ya empezó, está `cancelled` o `completed`, o si la persona **ya hizo check-in** (la ventana abre 15 minutos antes de `startsAt`). La reputación otorgada no se deshace.
- Idempotente: sin inscripción activa responde 204, sea cual sea el estado del plan. Plan inexistente o no visible → 404.
- Transacción: inscripción `active → cancelled` (con `cancelledAt`) y `participantCount − 1` condicionado a que sea mayor que 0.

## 4. Estados del plan

```
open ◀──▶ closed ──▶ completed      (job, al llegar endsAt; también desde open)
  │          │
  └────┬─────┘
       ▼
   cancelled                        (creador, hasta endsAt)
```

- ✅ El creador cambia el estado con `PATCH /plans/:id { status }`:
  - `open → closed` (cierra inscripciones) y `closed → open` (las reabre), solo antes de `startsAt`.
  - `open | closed → cancelled` en cualquier momento hasta `endsAt`.
- ✅ `completed` lo pone solo el job, cuando llega `endsAt`. `cancelled` y `completed` son finales.
- ✅ `closed` **no marca `noShow`**: solo impide inscripciones nuevas. Las bajas, el QR y el check-in siguen funcionando.
- ✅ En un plan cancelado no hay altas, bajas, QR ni check-in. Las inscripciones quedan como están. Los check-ins y la reputación ya otorgados se conservan, y **los `noShow` que el job ya había marcado también quedan**; lo que el job todavía no procesó no se procesa.
- ◻ Una transición no permitida (reabrir un plan que ya empezó, tocar uno cancelado o completado) → 409 `PLAN_CLOSED`.
- ◻ `status` va solo en el `PATCH`: combinado con otros campos es 400. Valores aceptados: `open`, `closed`, `cancelled` (`completed` es 400).
- El aviso a los inscriptos cuando se cancela un plan es push: queda para S5.

## 5. Parámetros del check-in

- ✅ El creador solo puede configurar el **radio**: `checkInRadiusMeters` opcional en `POST` y `PATCH /plans`, entero de 50 a 1000, por defecto 150.
- ✅ La **ventana la calcula siempre el back**: `checkInOpensAt = startsAt − 15 min` y `checkInClosesAt = min(startsAt + 60 min, endsAt)`. Se recalcula cuando cambian `startsAt` o `endsAt`. `checkInOpensAt` y `checkInClosesAt` en un body son 400.
- ✅ Precisión máxima aceptada del GPS: 100 m. Vida del QR: 90 s.
- ◻ Los valores (15 min, 60 min, 50/150/1000 m, 100 m, 90 s y el mínimo de asistentes del punto 8) se definen en un único archivo de reglas del back (`src/shared/attendance.js`), como los rangos de precio de S3.
- ◻ Bordes inclusivos: vale `checkInOpensAt ≤ ahora ≤ checkInClosesAt`, distancia `≤` radio y precisión `≤` 100 m. Un segundo antes de abrir se rechaza; exactamente en el radio se acepta.
- Los planes creados en S3 no tienen estos campos: la migración de S4 los completa con los valores por defecto. Los seeds también.

## 6. QR (`POST /plans/:id/qr`)

- Solo el creador (403 `FORBIDDEN` para el resto), con el plan `open` o `closed` (si no, 409 `PLAN_CLOSED`) y dentro de la ventana (si no, 409 `CHECKIN_WINDOW_CLOSED`).
- Nonce de 32 bytes (`crypto.randomBytes`); se guarda `qrNonceHash = sha256(nonce)` y `qrExpiresAt`. Respuesta 201 `{ qrToken, expiresAt }`. El token no se loguea.
- ◻ `expiresAt = min(ahora + 90 s, checkInClosesAt)`.
- ◻ Hay **un solo QR válido por plan**: generar uno nuevo invalida el anterior. La pantalla del creador pide otro unos 15 segundos antes de que venza; quien escaneó justo en el cambio recibe `QR_INVALID` y vuelve a escanear.
- ◻ Formato del token: `<planId>.<nonce en base64url>`. Lleva el plan adentro para rechazar el QR de otro plan sin consultar nada más.

## 7. Check-in (`POST /plans/:id/check-in`)

Body: `qrToken`, `latitude`, `longitude`, `accuracyMeters`. Validaciones, en este orden:

1. Formato (Zod estricto, coordenadas en rango, `accuracyMeters ≥ 0`) → 400.
2. Plan inexistente o no visible → 404.
3. Sin inscripción activa → 403 `FORBIDDEN`.
4. Plan `cancelled` o `completed` → 409 `PLAN_CLOSED`.
5. Ya hizo check-in → 409 `ALREADY_CHECKED_IN` (también lo garantiza el índice único).
6. Fuera de la ventana → 409 `CHECKIN_WINDOW_CLOSED`.
7. QR ausente, mal formado, de otro plan, que no coincide (`timingSafeEqual` sobre los hashes) o vencido → 403 `QR_INVALID`.
8. Distancia Haversine mayor al radio, o `accuracyMeters` mayor a 100 → 403 `OUT_OF_RANGE` (con un mensaje distinto en cada caso).

- Si todo pasa: se inserta el `checkIn` (`checkedInAt` del servidor, `distanceMeters`, `accuracyMeters`; **sin coordenadas**) y se suma `reputation +1`, en una transacción.
- ◻ Respuesta 201: `{ planId, checkedInAt, method, distanceMeters }` (distancia redondeada).
- No se encola offline: depende del momento exacto.

## 8. Check-in y reputación del creador

✅ Decidido por Paula:

- El creador **inscripto** hace check-in con el mismo endpoint, **sin `qrToken`**, solo con ubicación. Se validan inscripción activa, ventana, distancia y precisión.
- Ese check-in **no suma reputación en el momento**. Al cerrar la ventana, el job le da +1 solo si **al menos 2 participantes más** (sin contar al creador) hicieron check-in válido en ese plan.
- Si el creador inscripto no hizo check-in, se le marca `noShow` como a cualquiera. Un creador que no se inscribió no tiene inscripción: ni check-in ni `noShow`.
- El mínimo (2) es configurable en el back.

Consecuencias para la implementación:

- Es una excepción a la regla 4 de CLAUDE.md ("check-in y `reputation +1` en una transacción"): vale para todos menos para el creador.
- ◻ Los check-ins del creador se guardan con `method: 'location'` (los demás, `'qr-location'`). Hay que ampliar el enum en el modelo y en el validador de `checkIns` por migración.
- ◻ Si el creador manda `qrToken`, no se evalúa.

## 9. Cierre de asistencia, `noShow` y `completed`

- ✅ El job marca `noShow` cuando **cierra la ventana de check-in** (`checkInClosesAt`), no cuando el plan cambia de estado.
- ✅ El plan pasa a `completed` cuando llega `endsAt`.
- ✅ `noShow` no resta reputación: la reputación solo sube (+1 por check-in válido), como define el informe.
- ◻ Cierre de asistencia de un plan, en **una transacción**: se marca el plan como procesado con una actualización condicional (campo nuevo `attendanceClosedAt`, vacío → ahora), se pone `noShow: true` y `noShowAt` en las inscripciones activas sin check-in, y se da el +1 al creador si corresponde. La actualización condicional hace que corra una sola vez aunque dos instancias lleguen juntas.
- ◻ Aplica a planes `open` o `closed`. Los `cancelled` se saltean.
- ◻ Al completar un plan en `endsAt`, si el cierre de asistencia no había corrido (el scheduler estuvo caído), se hace en la misma transacción.

## 10. Scheduler (S4-BE-08)

- ✅ Corre dentro del back, con lock en Redis (`SET clave valor NX PX ttl`) para que, con dos o más instancias, cada job corra una sola vez por ciclo.
- ◻ Un ciclo por minuto. Jobs de S4: cierre de asistencia y completar planes. El recordatorio (`reminderSentAt`) es de S5.
- **⟳** El lock **no se libera al terminar: vence solo** (TTL de 54 s con un ciclo de 60 s). Si se liberara, otra instancia con el reloj un poco corrido repetiría el job dentro del mismo ciclo. Si Redis no responde, el ciclo se saltea y se loguea un `warn`; nunca se corre sin lock.
- ◻ Arranca después del `listen` y se detiene en el apagado ordenado. Logs: inicio, fin, cantidad procesada y si obtuvo el lock.

## 11. Reputación, anotados y "Mis planes"

- ✅ **Reputación visible para todos:** la vista pública del usuario pasa a `id`, `name`, `photoUrl`, `reputation`. Se ve en el creador de cada plan y en la lista de anotados.
- ✅ **`GET /plans/:id/participants`** (nuevo, paginado): `id`, `name`, `photoUrl` y `reputation` de los inscriptos activos. Lo ven los participantes activos y el creador; el resto, 403.
- ✅ Los `noShow` **nunca se muestran a otros**. En el perfil propio, `GET /users/me` suma `noShowCount` (calculado).
- ✅ **`GET /users/me/plans`** (nuevo, paginado): `role=created|joined` obligatorio y `when=upcoming|past` (por defecto `upcoming`). Incluye planes en cualquier estado, también cancelados y completados. En `joined` solo entran las inscripciones activas, con el estado propio (check-in hecho o `noShow`).
- ◻ `upcoming` = todavía no terminó (`endsAt > ahora`), del más próximo al más lejano; `past` = ya terminó, del más reciente al más viejo.
- ◻ Orden de los anotados: por `joinedAt`. Sin índice nuevo (un plan tiene como máximo 500 inscriptos).
- ◻ Plan inexistente o no visible en `/participants` → 404, antes que el 403.
- ◻ El detalle del plan (`GET /plans/:id`) suma `checkInOpensAt`, `checkInClosesAt`, `checkInRadiusMeters` y `myParticipation` (`{ status, joinedAt, checkedInAt, noShow }` o `null`). Es lo que la app necesita para decidir qué botón mostrar. Los listados del feed no lo llevan.

## 12. App

| Tarea | Decisión |
|-------|----------|
| S4-MOB-01 | PlanScreen: inscribirse / darse de baja; la UI cambia cuando el servidor confirma; un texto por `code` (`PLAN_FULL`, `PLAN_CLOSED`, `ALREADY_JOINED`). ✅ Suma la lista de anotados con su reputación. **⟳** También las acciones del creador: cerrar y reabrir inscripciones y cancelar el plan (con confirmación) |
| S4-MOB-02 | Pantalla del creador con el QR (`react-native-qrcode-svg` + `react-native-svg`), que se regenera antes de vencer y deja de pedir QR al salir. ✅ Si el creador está inscripto, botón para registrar su asistencia con ubicación |
| S4-MOB-03 | CheckInScreen: `expo-camera` para leer el QR y ubicación con precisión. Explica cada rechazo: `OUT_OF_RANGE` (lejos o señal imprecisa), `QR_INVALID`, `CHECKIN_WINDOW_CLOSED`, `ALREADY_CHECKED_IN`. Permisos pedidos en el momento |
| S4-MOB-04 | "Mis planes": creados / inscriptos, próximos / pasados. ✅ El perfil muestra la reputación y las ausencias propias (`noShowCount`) |

**⟳** "Mis planes" es un cuarto tab; el detalle del plan, el QR y el check-in se abren dentro del tab desde el que se entró ("Planes" o "Mis planes").

## 13. Pasado al sprint 5: aviso de cupo liberado

✅ **No entra en S4.** Queda asignado completo a S5:

- Colección `spotAlerts` con su migración.
- `PUT` y `DELETE /plans/:id/spot-alert`, y `spotAlertRequested` en el detalle del plan.
- Botón "Avisarme" en la app.
- Ganchos en la inscripción (borra el pedido de aviso) y en la baja (dispara el aviso, después del commit).
- Envío por push (FCM).

Hoy [pendientes](../pendientes.md#aviso-de-cupo-liberado) asigna los ganchos a S4: corregirlo junto con [05-chat-y-notificaciones.md](05-chat-y-notificaciones.md).

## 14. Fuera del alcance de S4

Push y avisos (nuevo inscripto, recordatorio, plan cancelado), chat, panel admin, caché offline y cola de pendientes.

## 15. Documentos a actualizar al implementar

Actualizados en el mismo PR que el código:

- **CLAUDE.md:** reglas 4 y 5 (redacción en el [punto 16](#16-cambios-a-aplicar-en-claudemd-al-iniciar-s4)), lista de endpoints, plan de sprints (aviso de cupo en S5).
- **06-api.md:** `status` y `checkInRadiusMeters` en `POST`/`PATCH /plans`; `qrToken` opcional para el creador; endpoints nuevos; campos nuevos del detalle, del perfil (`noShowCount`) y de la vista pública (`reputation`).
- **07-modelo-de-datos.md:** `plans.attendanceClosedAt`, `checkIns.method`, invariantes 4 y 5, diagrama de transiciones.
- **errores-y-logs.md:** `PLAN_CLOSED` cubre también transiciones no permitidas y la baja con check-in hecho; `FORBIDDEN` en `/participants`; textos de la app por `code`.
- **testing.md:** marcar "Cupos (concurrencia)" y "Check-in", y sumar los casos nuevos (creador, job, cancelación, anotados).
- **pendientes.md:** marcar ✅ parámetros del check-in, estados del plan, reactivación, jobs y visibilidad del perfil público; mover el aviso de cupo a S5.
- **04-inscripciones-asistencia.md:** sumar las tareas de los dos endpoints nuevos y del `PATCH status`.

Migraciones previstas (`up` + `down`): completar los campos de check-in en los planes existentes; validador de `plans` con `attendanceClosedAt` y el rango del radio; enum de `checkIns.method`.

## 16. Cambios a aplicar en CLAUDE.md al iniciar S4

✅ Redacción aprobada por Paula el 2026-10-12. El cambio en las reglas de reputación es intencional. **Aplicado** en `CLAUDE.md`, en un commit separado y sin tocar código.

Las reglas 4 y 5 de "Reglas que no se rompen" quedan así:

> 4. **Check-in:** inscripción activa + ventana (`checkInOpensAt`/`checkInClosesAt`) + QR + distancia ≤ `checkInRadiusMeters`. El QR es un desafío aleatorio con vencimiento (se guarda `qrNonceHash`), no el ID del plan. **No persistir la ubicación** del participante: solo `distanceMeters` y `accuracyMeters`. Check-in y `reputation +1` en una transacción.
>    - Excepción: el creador inscripto hace check-in sin QR (solo ubicación) y no suma en ese momento; recibe el +1 al cerrar la asistencia, solo si al menos 2 participantes más hicieron check-in.
> 5. **Reputación:** +1 por check-in válido; `noShow` no resta. El job de cierre de asistencia marca `noShow=true` en las inscripciones activas sin check-in cuando cierra la ventana de check-in, una sola vez por plan. Pasar un plan a `closed` no marca `noShow`; los planes `cancelled` no se procesan.

Aclaraciones confirmadas:

- "2 participantes más" no cuenta al creador: son 3 check-ins en total con el suyo.
- El creador solo recibe el +1 si está inscripto e hizo su check-in. Si está inscripto y no lo hizo, se le marca `noShow` como a cualquiera.
- La regla 5 no nombra el campo que marca el plan como procesado. Al implementar quedó `attendanceClosedAt` (la propuesta del [punto 9](#9-cierre-de-asistencia-noshow-y-completed)).
