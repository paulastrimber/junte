# Testing

Herramientas en [ADR-0007](../arquitectura/adr/0007-herramientas-de-testing.md). Regla general: **nada se mergea sin tests de lo que cambió**, y todo bug corregido trae el test que lo reproduce.

## Pirámide

```
            ┌──────────┐
            │   E2E    │  pocos: flujos críticos en el teléfono (Maestro) — sprint 7
          ┌─┴──────────┴─┐
          │  Contrato    │  cada endpoint: status, forma del JSON, códigos de error (Supertest)
        ┌─┴──────────────┴─┐
        │   Integración    │  repositorios + transacciones contra Mongo en memoria (replica set)
      ┌─┴──────────────────┴─┐
      │       Unitarios       │  servicios con fakes, funciones puras, hooks y componentes
      └───────────────────────┘
```

| Nivel | Qué cubre | Dependencias | Velocidad |
|-------|-----------|--------------|-----------|
| Unitario (back) | Reglas de negocio en servicios; Haversine, Jaccard, cursores, scorers | Fakes: repos en memoria, `clock` fijo, `notifier` espía | ms |
| Integración (back) | Repositorios, índices únicos, transacciones, `$geoNear` | `MongoMemoryReplSet` + migraciones aplicadas | s |
| Contrato (back) | Rutas + middlewares + validación + serialización + errores | `app.js` con Supertest + Mongo en memoria | s |
| Unitario (app) | Hooks (con `services` mockeados), componentes (render, eventos, 4 estados) | jest-expo + Testing Library | ms |
| E2E (app) | Login → feed → inscribirse → check-in → chat | Development build + entorno levantado | min |
| Front service | Config válida, IP real, 429, requestId, rewrite | `nginx -t` + `smoke.sh` | s |

## Qué se testea sí o sí

Estos casos salen del informe (7.5) y de las reglas de negocio. Cada uno tiene su test con el nombre indicado o equivalente:

**Auth y permisos**
- [x] Registro con email existente → 409 `EMAIL_TAKEN` (también con mayúsculas/espacios distintos). *(tests/contract/auth.test.js, tests/integration/auth-service.test.js)*
- [x] Token vencido → 401 `TOKEN_EXPIRED`; token con `typ: 'refresh'` usado como access → 401; firma con otro algoritmo → 401. *(también `alg: none`)*
- [x] Usuario `suspended` → 401.
- [x] Refresh reutilizado tras rotación → 401 y sesión revocada *(solo esa sesión; 10 refresh simultáneos → 1 éxito)*.
- [x] `PATCH /plans/:id` de un plan ajeno → 403. *(tests/contract/plans.test.js, src/modules/plans/plan.service.test.js; también `PUT …/photo` y `presign` con `planId`)*
- [ ] `/admin/*` sin rol admin → 403. *(`requireRole` ya está probado con una ruta de prueba: falta repetirlo sobre las rutas reales de `/admin` en S6)*

**Validación**
- [x] Campos solo-backend en el body (`creatorId`, `reputation`, `participantCount`, `role`…) → 400. *(`/auth` y `/users/me`: `role`, `status`, `reputation`, `age`, `photoKey`, `passwordHash`; `/plans`: `creatorId`, `participantCount`, `university`, `status`, `photoKey`, `qrNonceHash`)*
- [x] Operadores Mongo en el body (`{ "email": { "$ne": null } }`) → 400.
- [x] Coordenadas fuera de rango, `capacity` ≤ 0, fechas incoherentes → 400. *(plan.validators.test.js, tests/contract/plans.test.js; filtros inválidos del feed en tests/contract/feed.test.js)*

**Cupos (concurrencia)** *(tests/integration/participation-concurrency.test.js, tests/contract/participations.test.js)*
- [x] N inscripciones simultáneas a un plan con cupo K < N → exactamente K exitosas, el resto 409 `PLAN_FULL`, `participantCount === K`.
- [x] Con cupo ilimitado, N inscripciones simultáneas → N exitosas.
- [x] El mismo usuario inscribiéndose en paralelo dos veces → 1 éxito, 1 `ALREADY_JOINED`, contador +1 (también al reactivar una inscripción cancelada).
- [x] Baja → contador −1 y registro `cancelled`, en la misma transacción; si el plan ya no admite bajas, se revierte la cancelación.
- [x] Altas y bajas mezcladas → `participantCount` igual a las inscripciones activas.
- [x] `PATCH capacity` por debajo de los inscriptos → 409. *(tests/contract/plans.test.js)*

**Check-in** *(tests/contract/checkins.test.js)*
- [x] QR vencido → rechazado. QR de otro plan → rechazado. QR anterior: válido 10 segundos después de renovarlo, rechazado después (y nunca más allá de su propio vencimiento).
- [x] Inscripción inactiva o inexistente → rechazado.
- [x] Fuera del radio o con `accuracyMeters` excesiva → 403 `OUT_OF_RANGE` (exactamente en el límite se acepta).
- [x] Fuera de la ventana horaria → 409 `CHECKIN_WINDOW_CLOSED` (un segundo antes de abrir y un segundo después de cerrar).
- [x] Segundo check-in → 409 `ALREADY_CHECKED_IN`; reputación +1 una sola vez (también con dos pedidos simultáneos).
- [x] La ubicación exacta **no** queda guardada en `checkIns`.
- [x] El creador inscripto registra su asistencia sin QR y no suma reputación en el momento.

**Cierre de asistencia y estados del plan** *(tests/integration/attendance.test.js, tests/contract/plan-status-and-my-plans.test.js, src/jobs/scheduler.test.js)*
- [x] Al cerrar la ventana, `noShow` solo en las inscripciones activas sin check-in; no resta reputación; una sola vez por plan, aunque dos instancias lleguen juntas.
- [x] Cerrar inscripciones (`closed`) no marca `noShow`; los planes cancelados no se procesan.
- [x] El creador recibe su +1 solo si hizo check-in y al menos 2 participantes más también.
- [x] `completed` al llegar `endsAt`; si el cierre de asistencia no había corrido, se hace en la misma operación.
- [x] Transiciones del creador: cerrar y reabrir antes de `startsAt`, cancelar hasta `endsAt`; `cancelled` es final.
- [x] Scheduler: con dos instancias el job corre una sola vez por ciclo; sin Redis no corre.
- [x] `GET /plans` y `POST /feed` no traen los planes propios ni aquellos con inscripción activa. *(tests/contract/plans.test.js, tests/contract/feed.test.js)*

**Chat y reportes**
- [ ] No participante → 403 por REST y por Socket.io.
- [ ] Texto vacío o > 2000 → 400.
- [ ] Reintento de `chat:send` con el mismo `clientId` → un solo mensaje.

**Contrato general**
- [ ] Todo error tiene `{ code, message, requestId }` y nunca stack ni detalles internos.
- [x] Paginación: `limit` > 100 → 400; último page con `nextCursor: null`; sin duplicados ni saltos entre páginas. *(listado cronológico y feed por ranking: tests/contract/plans.test.js y feed.test.js; falta repetirlo en el chat, S5)*

**Planes y feed (S3)**
- [x] Ranking: el plan con los mismos intereses y cerca queda primero; cambiar los pesos en la configuración cambia el orden. *(src/modules/feed/feed.scorers.test.js, feed.service.test.js, tests/contract/feed.test.js)*
- [x] `$geoNear` con planes a distancias conocidas en Montevideo: radio, orden y distancia en metros. *(tests/integration/plan-repository.test.js)*
- [x] Visibilidad: plan cancelado, completado o terminado → 404 para un tercero, visible para su creador e inscriptos.
- [x] Filtros predefinidos (fecha, intereses, varios rangos de precio, con cupo / llenos) y cupo ilimitado (nunca lleno).
- [x] Compatibilidad horaria: 0.5 sin calendario, 0 con superposición (calendario o planes inscriptos), 1 sin superposición.
- [x] App: sin permiso de calendario no se envía nada; sin ubicación el feed lista por fecha. *(mobile/src/hooks/useFeed.test.js, services/calendar.test.js)*

**Catálogos y perfil**
- [x] Universidad, carrera, ciudad, barrio e intereses inexistentes, desactivados, de otra universidad/ciudad o con edad mínima → 400 con `details` por campo. *(src/modules/catalogs/catalog.rules.test.js, tests/contract/users.test.js)*
- [x] Los datos iniciales de los catálogos son consistentes (keys válidas y únicas, carreras de universidades que existen, sin tecnicaturas) y `syncCatalogs` solo inserta. *(tests/integration/catalogs.test.js)*

## Convenciones

- **Ubicación:** unitarios junto al archivo (`plan.service.test.js`); integración y contrato en `back-service/tests/`.
- **Nombres que describen comportamiento:** `it('rechaza la inscripción cuando el plan está lleno')`, no `it('join test 3')`.
- **Arrange / Act / Assert** separados por una línea en blanco.
- **Un comportamiento por test.** Varios `expect` está bien si verifican lo mismo.
- **Independencia:** cada test crea sus datos con factories (`makeUser()`, `makePlan({ capacity: 2 })`) y limpia la base en `beforeEach`. Nunca depender del orden de ejecución.
- **Determinismo:** nada de `Date.now()` real ni `Math.random()` sin control en lógica testeada: se inyecta `clock` y generadores.
- **No testear la implementación:** se testea qué devuelve o qué cambia en la DB, no qué funciones internas se llamaron (salvo efectos externos como `notifier`).

## Base de datos en tests

```js
// tests/helpers/db.js
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { runMigrations } from '../../src/adapters/db/migrations.js'

let replSet
export async function startDb () {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } }) // replica set → transacciones
  await mongoose.connect(replSet.getUri())
  await runMigrations(mongoose.connection.db)                        // índices reales, los mismos que producción
}
export async function clearDb () {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})))   // borra datos, conserva índices
}
export async function stopDb () { await mongoose.disconnect(); await replSet.stop() }
```

Aplicar las migraciones en los tests garantiza dos cosas: que los índices únicos realmente protegen los invariantes, y que las migraciones funcionan.

## Ejemplo: test de concurrencia

```js
it('no supera el cupo con inscripciones simultáneas', async () => {
  const plan = await makePlan({ capacity: 3 })
  const users = await Promise.all(Array.from({ length: 10 }, () => makeUser()))

  const results = await Promise.allSettled(users.map(u => participationService.join({ planId: plan.id, userId: u.id })))

  const ok = results.filter(r => r.status === 'fulfilled')
  const full = results.filter(r => r.reason?.code === 'PLAN_FULL')
  expect(ok).toHaveLength(3)
  expect(full).toHaveLength(7)
  expect((await Plan.findById(plan.id)).participantCount).toBe(3)
  expect(await Participation.countDocuments({ planId: plan.id, status: 'active' })).toBe(3)
})
```

> Con transacciones concurrentes MongoDB puede abortar algunas por conflicto de escritura (`WriteConflict`); `session.withTransaction` las reintenta. El test valida el resultado final, que es lo que importa.

## Cobertura

- Objetivo: **≥ 80 % de líneas en `services/`** del back y en `hooks/` de la app. El resto sin umbral fijo.
- La cobertura es una alarma, no un objetivo: 100 % con asserts vacíos no sirve.
- CI publica el reporte; no baja respecto de `main` sin justificación en el PR.

## En CI (cada PR)

1. Lint (back y app).
2. Tests unitarios + integración + contrato del back (con Mongo en memoria).
3. Tests de la app.
4. `nginx -t`.
5. Migraciones `up` → `down` → `up` sobre una base vacía (que el `down` funcione).

## Pruebas manuales que quedan documentadas

Algunas verificaciones del informe no se automatizan en CI (aislamiento de red en AWS, pérdida de un nodo del replica set, restauración de backup, push en dispositivo real). Se ejecutan en el sprint 7 con una checklist y se guarda evidencia (capturas, comandos, salidas) en `docs/evidencia/`.
