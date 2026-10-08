# Sprint 3 · Planes y feed por cercanía

**Objetivo:** crear, editar y descubrir planes; el feed muestra primero lo cercano y compatible.

**Entregable:** CRUD de planes, feed geográfico paginado con recomendación, integración de calendario, pruebas de filtros y de autorización del creador.

**Decidir antes:** [intereses del plan](../pendientes.md#intereses-del-plan), [compatibilidad horaria](../pendientes.md#compatibilidad-horaria), [paginación del feed](../pendientes.md#paginación-del-feed), [visibilidad](../pendientes.md#visibilidad-de-planes).

## Back service

- [ ] **S3-BE-01 · `POST /plans`**: `creatorId` del token, `university` del perfil del creador, `participantCount: 0`, `status: 'open'`; `PROFILE_INCOMPLETE` si corresponde.
  *Acepta:* `creatorId` o `participantCount` en el body → 400.
- [ ] **S3-BE-02 · `GET /plans/:id`** con cupos disponibles y regla de visibilidad.
- [ ] **S3-BE-03 · `PATCH /plans/:id`**: solo el creador (403), campos editables, `CAPACITY_BELOW_PARTICIPANTS`.
- [ ] **S3-BE-04 · `GET /plans` sin `near`**: filtros `from`, `to`, `university`, paginación por cursor `{ startsAt, _id }`.
- [ ] **S3-BE-05 · Feed con `near`**: `$geoNear` (índice 2dsphere, distancia en metros) limitado a `radiusKm`, tope de candidatos.
  *Acepta:* test de integración con planes a distancias conocidas en Montevideo.
- [ ] **S3-BE-06 · Módulo `feed`**: scorers puros (Jaccard, proximidad lineal, horario con 0.5 neutral) y pesos desde config ([ejemplo](../practicas/solid-y-modularidad.md#o--abiertocerrado)).
  *Acepta:* tests unitarios de cada scorer y del ranking; cambiar los pesos en config cambia el orden sin tocar código.
- [ ] **S3-BE-07 · Cursor del feed** según la decisión de paginación.
- [ ] **S3-BE-08 · `PUT /plans/:id/photo`** (reusa el flujo de S2-BE-09).
- [ ] **S3-BE-09 · Migración** de índices nuevos (`creatorId+startsAt`, `interests` si se agrega).

## App

- [ ] **S3-MOB-01 · `services/location.js`**: permiso, posición actual, manejo de rechazo.
- [ ] **S3-MOB-02 · HomeScreen (feed)** con `FlatList`, scroll infinito por `nextCursor`, pull-to-refresh, 4 estados.
- [ ] **S3-MOB-03 · PlanScreen** (detalle, cupos, creador).
- [ ] **S3-MOB-04 · CreatePlanScreen / editar**: selector de ubicación (`[lng, lat]`), fecha/hora con zona, capacidad, intereses.
- [ ] **S3-MOB-05 · Calendario** (`expo-calendar`): leer franjas ocupadas según la decisión; sin permiso → no se envía nada.

## Pruebas obligatorias

- Plan ajeno → 403; filtros inválidos → 400; paginación sin duplicados ni saltos.
- Ranking: plan con mismos intereses y cerca queda primero.
