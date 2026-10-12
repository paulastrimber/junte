# Sprint 3 · Planes y feed por cercanía

**Objetivo:** crear, editar y descubrir planes; el feed muestra primero lo cercano y compatible.

**Entregable:** CRUD de planes, feed geográfico paginado con recomendación, integración de calendario, pruebas de filtros y de autorización del creador.

**Decidido (2026-10-12):** [intereses del plan](../pendientes.md#intereses-del-plan), [compatibilidad horaria](../pendientes.md#compatibilidad-horaria), [paginación del feed](../pendientes.md#paginación-del-feed), [visibilidad](../pendientes.md#visibilidad-de-planes), [radio](../pendientes.md#radio-del-feed), [filtros, costo, planes llenos y cupo ilimitado](../pendientes.md#filtros-del-feed-costo-y-planes-llenos). Notas del sprint y lo que quedó sin probar: [pendientes · F](../pendientes.md#f-notas-del-sprint-3-planes-y-feed).

## Back service

- [x] **S3-BE-01 · `POST /plans`**: `creatorId` del token, `university` del perfil del creador, `participantCount: 0`, `status: 'open'`; `PROFILE_INCOMPLETE` si corresponde.
  *Acepta:* `creatorId` o `participantCount` en el body → 400.
- [x] **S3-BE-02 · `GET /plans/:id`** con cupos disponibles y regla de visibilidad.
- [x] **S3-BE-03 · `PATCH /plans/:id`**: solo el creador (403), campos editables, `CAPACITY_BELOW_PARTICIPANTS`.
- [x] **S3-BE-04 · `GET /plans` sin `near`**: filtros `from`, `to`, `university`, paginación por cursor `{ startsAt, _id }`.
- [x] **S3-BE-05 · Feed con `near`**: `$geoNear` (índice 2dsphere, distancia en metros) limitado a `radiusKm`, tope de candidatos.
  *Acepta:* test de integración con planes a distancias conocidas en Montevideo.
- [x] **S3-BE-06 · Módulo `feed`**: scorers puros (Jaccard, proximidad lineal, horario con 0.5 neutral) y pesos desde config ([ejemplo](../practicas/solid-y-modularidad.md#o--abiertocerrado)).
  *Acepta:* tests unitarios de cada scorer y del ranking; cambiar los pesos en config cambia el orden sin tocar código.
- [x] **S3-BE-07 · Cursor del feed** según la decisión de paginación.
- [x] **S3-BE-08 · `PUT /plans/:id/photo`** (reusa el flujo de S2-BE-09).
- [x] **S3-BE-09 · Migraciones** de `plans`: `endsAt` y `price` (backfill) y validador nuevo. No hicieron falta índices nuevos (`creatorId+startsAt` ya existía desde S1; ver [07](../arquitectura/07-modelo-de-datos.md#índices)).
- [x] **S3-BE-10 · Filtros predefinidos** en `GET /plans` y `POST /feed`: fecha, intereses, rangos de precio combinables y cupo (`availability`); `GET /plans/filters` con los rangos definidos en un solo lugar.
- [x] **S3-BE-11 · Costo y cupo ilimitado**: `price` (0 = gratis) y `capacity: null` (sin límite; nunca lleno) en `POST`/`PATCH` y en el detalle; `isFull` y `availableSpots` calculados.
- [x] **S3-BE-12 · Compatibilidad horaria**: `endsAt` obligatorio; `POST /feed` con las franjas del calendario; los planes inscriptos cuentan como ocupados.

## App

- [x] **S3-MOB-01 · `services/location.js`**: permiso, posición actual, manejo de rechazo.
- [x] **S3-MOB-02 · HomeScreen (feed)** con `FlatList`, scroll infinito por `nextCursor`, pull-to-refresh, 4 estados.
- [x] **S3-MOB-03 · PlanScreen** (detalle, cupos, creador).
- [x] **S3-MOB-04 · CreatePlanScreen / editar**: selector de ubicación (`[lng, lat]`) con mapa, buscador de dirección y "usar mi ubicación"; fecha y hora de inicio y fin con zona; cupo o "Cupo ilimitado"; costo; intereses.
- [x] **S3-MOB-05 · Calendario** (`expo-calendar`): leer franjas ocupadas según la decisión; sin permiso → no se envía nada.
- [x] **S3-MOB-06 · Filtros del feed**: panel con distancia (0.5 a 50 km), fecha, costo y tipo de actividad; secciones "Con cupo" / "Llenos".
- [x] **S3-MOB-07 · Navegación con tabs** (Planes, Crear, Perfil).

> La app **no se probó en emulador ni en teléfono** (tests, lint y `expo export` sí). El mapa necesita la clave de Google Maps y un development build.

## Pruebas obligatorias

- Plan ajeno → 403; filtros inválidos → 400; paginación sin duplicados ni saltos.
- Ranking: plan con mismos intereses y cerca queda primero.
