# Sprint 6 · Administración y comportamiento móvil

**Objetivo:** moderación protegida, una app que se comporta bien sin conexión y un sistema observable y recuperable.

**Entregable:** panel `/admin` con permisos, offline + sincronización sin confirmar operaciones no aceptadas, logs en CloudWatch, Session Manager y backups verificados.

**Decidido (2026-10-14, Domenico):** [endpoints y métricas de admin](../pendientes.md#endpoints-y-métricas-de-administración) (la propuesta de 06 + vista previa de lo reportado), suspensión que solo corta el acceso, reportes con motivos fijos y sin duplicados pendientes, cola offline para chat, reportes e inscripciones (AsyncStorage + NetInfo), y la infraestructura queda para el equipo de AWS. Notas en [pendientes · I](../pendientes.md#i-notas-del-sprint-6-admin-y-móvil).

**Estado:** back, panel y app ✅ con tests y lint (back 1176 tests, app 730). **Sin probar con docker compose** (Docker Desktop no arrancó en la máquina donde se hizo: falta `nginx -t` y `smoke.sh`) ni la app en un teléfono. El panel sí se probó en un navegador contra el back real. Infraestructura ⛔ (equipo de AWS).

## Back service

- [x] **S6-BE-01 · `POST /reports`**: `reporterId` del token, verifica que el objetivo exista y sea accesible; nunca expuesto a otros usuarios.
  *Hecho:* motivos fijos, descripción obligatoria con `other`, 404 si no lo puede ver, 400 si es algo propio, reporte pendiente repetido → 200 con el mismo (índice único parcial por migración). `tests/contract/reports.test.js`.
- [x] **S6-BE-02 · Módulo `admin`** detrás de `requireRole('admin')`: listar/resolver reportes, ocultar mensajes (emite `chat:hidden`), suspender usuarios.
  *Acepta:* cada endpoint `/admin/*` con usuario común → 403. *(tests/contract/admin.test.js, admin-realtime.test.js; el servicio vuelve a comprobar el rol)*
- [x] **S6-BE-03 · `GET /admin/metrics`** (agregaciones simples). *Totales y últimos 7 días.*
- [x] **S6-BE-04 · Script operativo** para crear/promover el primer admin (no expuesto por API). *`npm run admin -- promote|create|demote <email>` / `task db:admin`; tests en `tests/integration/admin-accounts.test.js`.*
- [x] **S6-BE-05 · Revisión de logs**: ningún dato sensible, `redact` activo, nivel `info` en AWS. *Sin hallazgos en los logs existentes; se suman al `redact` el email, el texto del chat y la descripción de los reportes; `LOG_LEVEL=info` documentado.*
- [x] **S2b · Admin de catálogos** (listar, crear, renombrar, ordenar, activar/desactivar) con `catalogService.invalidate()`. `tests/contract/admin-catalogs.test.js`.

## Front service

- [x] **S6-NG-01 · Panel `/admin` estático**: login, cola de reportes, acciones de moderación. Token solo en memoria.
  *Hecho:* también métricas y catálogos; CSP estricta y cabeceras de seguridad; `smoke.sh` las verifica. **Probado en un navegador** contra el back real (Mongo en memoria, con las mismas cabeceras que Nginx; 2026-10-14): login, cuenta sin rol rechazada, cola con vista previa, ocultar, resolver, suspender, métricas, catálogos (buscar, editar, agregar, key repetida), cerrar sesión, sin violaciones de CSP y con HTML de usuarios mostrado como texto. **Falta** `nginx -t` y `smoke.sh` contra docker compose.

## App

- [x] **S6-MOB-01 · Caché de lecturas** (feed, detalle, mis planes, historial) marcada "sin conexión". *También catálogos y el propio perfil (la app abre sin red).*
- [x] **S6-MOB-02 · Cola de escrituras pendientes**: reintento al reconectar; la UI muestra "pendiente" y nunca confirma antes del servidor; maneja 409 al sincronizar. *Inscribirse, darse de baja, mensajes y reportes; pantalla "Pendientes".*
- [x] **S6-MOB-03 · `POST /reports`** desde plan, usuario y mensaje. *Plan y creador en el detalle, anotados en la lista, mensajes con pulsación larga en el chat.*
- [x] **S6-MOB-04 · Revisión de permisos y batería**: ubicación solo en primer plano y cuando se usa; sin polling cuando la app está en segundo plano.
- [x] **S6-MOB-05 · Manejo de errores uniforme** en todas las pantallas. *`ErrorState` para cargas que fallan (con variante "Sin conexión"), `ErrorBanner` para acciones.*

## Infraestructura

A cargo del equipo de AWS (decidido el 2026-10-14: el equipo de la app no toca `infra/`). El plan está en [plan-aws.md · Sprint 6](../infra/plan-aws.md#sprint-6--observabilidad-y-backups). Todo está en código; falta correrlo en una sesión de dev y guardar la evidencia.

- [ ] 🔄 (Paula) **S6-INF-01 · CloudWatch**: agente en Nginx y back, grupos de logs con retención limitada, búsqueda por `requestId`.
  *Estado:* grupos con 14 días y driver `awslogs` en los dos contenedores desde S1; el error log de Nginx va con nivel `crit` en AWS (trae la query string). Verificación: `task aws:verify` (pasos 3 y 4).
- [ ] 🔄 (Paula) **S6-INF-02 · Session Manager** operativo en todas las EC2 (sin puerto 22).
  *Estado:* desde el paso 1.10. Verificación: `task aws:verify` (paso 2).
- [ ] 🔄 (Paula) **S6-INF-03 · Backups de MongoDB** programados a S3.
  *Estado:* timer cada hora instalado por `task aws:mongo-init`; falta ver un archivo en `backups/` en AWS (`task aws:backup`).
- [ ] 🔄 (Paula) **S6-INF-04 · Restauración probada** en un entorno separado, con evidencia.
  *Estado:* `task aws:restore` (EC2 temporal `32-restore.yml`, aislada del replica set) restaura un backup nuevo y compara documentos e índices por colección; probado en Docker local. Falta correrlo en AWS.
