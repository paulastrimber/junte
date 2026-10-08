# Sprint 6 · Administración y comportamiento móvil

**Objetivo:** moderación protegida, una app que se comporta bien sin conexión y un sistema observable y recuperable.

**Entregable:** panel `/admin` con permisos, offline + sincronización sin confirmar operaciones no aceptadas, logs en CloudWatch, Session Manager y backups verificados.

**Decidir antes:** [endpoints y métricas de admin](../pendientes.md#endpoints-y-métricas-de-administración).

## Back service

- [ ] **S6-BE-01 · `POST /reports`**: `reporterId` del token, verifica que el objetivo exista y sea accesible; nunca expuesto a otros usuarios.
- [ ] **S6-BE-02 · Módulo `admin`** detrás de `requireRole('admin')`: listar/resolver reportes, ocultar mensajes (emite `chat:hidden`), suspender usuarios.
  *Acepta:* cada endpoint `/admin/*` con usuario común → 403.
- [ ] **S6-BE-03 · `GET /admin/metrics`** (agregaciones simples).
- [ ] **S6-BE-04 · Script operativo** para crear/promover el primer admin (no expuesto por API).
- [ ] **S6-BE-05 · Revisión de logs**: ningún dato sensible, `redact` activo, nivel `info` en AWS.

## Front service

- [ ] **S6-NG-01 · Panel `/admin` estático**: login, cola de reportes, acciones de moderación. Token solo en memoria.

## App

- [ ] **S6-MOB-01 · Caché de lecturas** (feed, detalle, mis planes, historial) marcada "sin conexión".
- [ ] **S6-MOB-02 · Cola de escrituras pendientes**: reintento al reconectar; la UI muestra "pendiente" y nunca confirma antes del servidor; maneja 409 al sincronizar.
- [ ] **S6-MOB-03 · `POST /reports`** desde plan, usuario y mensaje.
- [ ] **S6-MOB-04 · Revisión de permisos y batería**: ubicación solo en primer plano y cuando se usa; sin polling cuando la app está en segundo plano.
- [ ] **S6-MOB-05 · Manejo de errores uniforme** en todas las pantallas.

## Infraestructura

- [ ] **S6-INF-01 · CloudWatch**: agente en Nginx y back, grupos de logs con retención limitada, búsqueda por `requestId`.
- [ ] **S6-INF-02 · Session Manager** operativo en todas las EC2 (sin puerto 22).
- [ ] **S6-INF-03 · Backups de MongoDB** programados a S3.
- [ ] **S6-INF-04 · Restauración probada** en un entorno separado, con evidencia.
