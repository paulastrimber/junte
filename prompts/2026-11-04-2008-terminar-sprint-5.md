# Terminar el sprint 5 (push, spotAlerts, notas de voz)

- **Autor:** @mperez14ang
- **Fecha:** 2026-11-04T20:08:30-03:00

## Prompt

> Prompt que el orquestador (ver `2026-11-04-2005-orquestar-sprint-5.md`) le pasó al agente que hizo el trabajo.

Sos el desarrollador encargado de terminar el **Sprint 5 (chat y notificaciones)** de junte, en el repo `/Users/manuelperez/orca/workspaces/junte/Primary` (worktree git; trabajá solo ahí, no hagas `cd` fuera, no uses `git stash` sin tag). Ya estás en el branch `feat/S5-push-spot-alerts-voz`, creado desde `main` actualizado. Leé primero `CLAUDE.md` (reglas que no se rompen, estructura MVC/DI, convenciones) y respetalo estrictamente.

## Qué ya está hecho (no rehacer)
Chat completo: S5-BE-01..05 (servicio de mensajes, REST, Socket.io con adaptador Redis, eventos) y S5-MOB-01/02 (socket.js, ChatScreen). Existe `back-service/src/modules/devices/device-token.model.js` (solo el modelo) y la migración `create-device-tokens`. No hay nada de FCM ni `spotAlerts` todavía.

## Qué falta (fuente: `docs/tareas/05-chat-y-notificaciones.md`)
- S5-BE-10 · `spotAlerts` (colección + migración con índice único `{planId,userId}`, `PUT`/`DELETE /plans/:id/spot-alert`, `spotAlertRequested` en el detalle, ganchos en el servicio de inscripciones de S4).
- S5-BE-06 · `POST /devices` y `DELETE /devices/:token`.
- S5-BE-07 · adapter FCM + `notifier` (después del commit, sin bloquear la respuesta, borra tokens inválidos). El adapter debe tener una implementación fake/no-op para local y tests cuando no hay credenciales; las credenciales vienen de Secrets Manager / `.env` (agregar los nombres a `.env.example`, sin valores).
- S5-BE-08 · avisos: nuevo inscripto al creador, recordatorio (job con lock en Redis + `reminderSentAt`, por migración si cambia el modelo), cupo liberado a todos los que pidieron aviso. Adoptá la propuesta de la tarea para el ciclo de vida de los pedidos y documentala.
- S5-BE-09 + S5-MOB-05 · notas de voz según la decisión de `docs/pendientes.md` ("Notas de voz y contactos"). Leé exactamente qué se aprobó; si la decisión incluye contactos, implementalo también según lo aprobado.
- S5-MOB-03 · `mobile/src/services/push.js` (permiso, `getDevicePushTokenAsync()`, registro en `/devices`, baja al logout, abrir el plan al tocar la notificación).
- S5-MOB-06 · botón "Avisarme si se libera un lugar" en el detalle de un plan lleno.
- S5-MOB-04 (development build con `google-services.json` en teléfono real) y la parte AWS de S5-NG-01 **no las podés hacer vos**: dejá todo preparado (config en `app.config.js`/`eas.json` leyendo `google-services.json` por variable/archivo no versionado, `.gitignore`) y listá exactamente qué tiene que hacer el humano.

## Contexto a leer
`docs/pendientes.md` secciones "Aviso de cupo liberado", "Notas de voz y contactos", "Jobs programados", y "H. Notas del sprint 5"; `docs/arquitectura/08-tiempo-real-y-push.md`, `06-api.md`, `07-modelo-de-datos.md`, `05-mobile.md`, `docs/practicas/testing.md`, `docs/practicas/errores-y-logs.md`. Mirá cómo están hechos los módulos existentes (`participations`, `messages`, `uploads`, `src/jobs/`, `container.js`) y copiá sus patrones.

## Cómo trabajar
- Tests primero para reglas de negocio (criterios de aceptación de S5-BE-10: dos pedidos → uno; pedir con cupo → 409; cupo ilimitado nunca admite pedidos; notifier llamado después del commit y no si la transacción falla; tokens inválidos borrados; job de recordatorio idempotente).
- Si algo no está definido en docs, elegí la opción más chica y anotala en `docs/pendientes.md` (nueva subsección en H) en vez de inventar en silencio. Si es una decisión grande que no podés tomar razonablemente, pará y reportala.
- Actualizá `docs/` en el mismo branch (06-api, 07-modelo, 08, tareas con checkboxes marcados y evidencia). Docs y mensajes al usuario en español; código y commits en inglés (Conventional Commits).
- Antes de terminar corré `task ci` (o lo equivalente: lint + tests del back y del mobile + migraciones). Si algo requiere Docker y no está disponible, decilo.
- Hacé commits chicos y lógicos en el branch, terminando cada mensaje con la línea:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **No hagas push ni abras PR**, no toques AWS ni `infra/` de CloudFormation.

## Reporte final
Devolvé: lista de tareas completadas con commits, resultado de `task ci`/tests (con salida si algo falla), decisiones tomadas y anotadas, y una lista concreta y ordenada de **lo que necesita hacer el humano** (p. ej. crear proyecto Firebase, bajar `google-services.json`, cargar la service account en Secrets Manager con el nombre X, probar en teléfono, prueba WS 5 min en AWS).
