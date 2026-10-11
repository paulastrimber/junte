# 03 · Back service (capa 5 · Aplicación)

Node.js + Express 5 + Socket.io, JavaScript ESM, Mongoose, Zod. Es el **único** componente que accede a MongoDB, emite JWT y aplica reglas de negocio.

## MVC + capa de servicios

El back es una API, así que el patrón MVC se traduce así:

| Rol MVC | Pieza en junte | Hace | Nunca hace |
|---------|---------------|------|-----------|
| **Model** | `*.model.js` (esquema Mongoose) + `*.repository.js` (consultas) | Define documentos, encapsula queries | Reglas de negocio, conocer `req`/`res` |
| **View** | `*.serializer.js` | Convierte un documento en el JSON público (`_id` → `id`, oculta `passwordHash`, `qrNonceHash` y todo lo de sesiones; calcula `age`; firma `photoUrl`) | Consultar la DB |
| **Controller** | `*.controller.js` | Lee `req` ya validado, llama al servicio, elige status HTTP, pasa por el serializer | Lógica de negocio, importar modelos |
| *(Service)* | `*.service.js` | **Todas** las reglas de negocio, permisos de dominio, transacciones | Importar Express, leer `req`, armar JSON de salida |

La capa de servicios no es parte del MVC clásico, pero el informe la exige: es donde vive el negocio, y es lo que se testea más.

## Estructura (por módulo de dominio)

Ver [ADR-0001](adr/0001-organizacion-por-modulos.md). Cada módulo contiene las mismas capas que pide el informe (`routes`, `controllers`, `services`, `models`, `validators`), agrupadas por funcionalidad en lugar de por tipo.

```
back-service/
  src/
    app.js                 # crea la app Express (sin listen) → la usa Supertest
    server.js              # arranque: config, conexiones, listen, Socket.io
    container.js           # composition root: arma todas las dependencias (DI)
    config/
      index.js             # carga y valida variables de entorno con Zod
    modules/
      auth/                # register, login, refresh, logout, sesiones (colección sessions), tokens
      users/               # perfil, foto, isProfileComplete
      catalogs/            # intereses, universidades, carreras, ciudades, barrios (GET /catalogs + reglas de validación)
      plans/               # CRUD de planes, QR, cierre
      participations/      # join / leave (transacción de cupo)
      checkins/            # check-in + reputación
      feed/                # recomendación (scorers)
      messages/            # chat REST
      reports/
      devices/             # deviceTokens para FCM
      uploads/             # URLs firmadas de S3
      admin/               # moderación (requiere role=admin)
    middlewares/           # requestId, authenticate, requireRole, validate, errorHandler, notFound
    sockets/               # setup de Socket.io, auth del handshake, handlers de chat
    adapters/              # db (Mongo + withTransaction), redis, storage (s3 + memoria), passwordHasher (Argon2id), fcm, secrets, clock, logger
    shared/                # AppError + catálogo de errores, paginación por cursor, utils puros (interests: lista cerrada, age: fechas de calendario y edad, uploads, validation: Zod en español, router: enrutado estricto)
  migrations/              # migrate-mongo (ver practicas/migraciones.md)
  catalogs/                # datos iniciales de los catálogos + syncCatalogs (solo inserta); los carga una migración
  seeds/                   # datos de desarrollo, nunca en producción
  tests/
    integration/           # repos + Mongo en memoria (replica set)
    contract/              # HTTP con Supertest
    helpers/
  scripts/migrate-check.js # up → down → up sobre un MongoMemoryReplSet efímero (lo corre CI)
  migrate-mongo-config.js
  vitest.config.js
  eslint.config.js         # neostandard + fronteras de capas (import/no-restricted-paths)
  Dockerfile
  .env.example
```

Archivos dentro de un módulo (ejemplo `plans/`):

```
plans/
  plan.model.js          plan.repository.js
  plan.service.js        plan.service.test.js
  plan.controller.js     plan.routes.js
  plan.validators.js     plan.serializer.js
  index.js               # API pública del módulo: lo único que otros módulos importan
```

## Reglas de dependencia

```
routes → controller → service → repository → model
              ↓            ↓
         serializer     adapters (vía DI)
```

- Una capa solo importa la **de abajo**. Nunca al revés.
- Un **servicio no importa** `express`, `mongoose` ni modelos: recibe repositorios y adapters por parámetro.
- Un **controlador no importa** modelos ni repositorios.
- Entre módulos solo se importa desde `index.js` (nunca `../plans/plan.repository.js` desde otro módulo).
- Un servicio que necesita datos de otro módulo recibe ese repositorio/servicio inyectado en `container.js`.
- `shared/` no importa nada de `modules/`.

Estas reglas se hacen cumplir con ESLint (`import/no-restricted-paths`), no solo de palabra.

## Inyección de dependencias (sin framework)

Cada servicio es una **factory** que recibe sus dependencias:

```js
// modules/participations/participation.service.js
export function createParticipationService ({ planRepo, participationRepo, withTransaction, notifier, clock }) {
  return {
    async join ({ planId, userId }) {
      const participation = await withTransaction(async (session) => {
        const plan = await planRepo.incrementIfCapacity(planId, { session })
        if (!plan) throw await planRepo.explainJoinFailure(planId) // 404 | PLAN_FULL | PLAN_CLOSED
        // si ya había una activa, el índice único dispara E11000 → ALREADY_JOINED (409) y se revierte el $inc
        return participationRepo.activate({ planId, userId, at: clock.now() }, { session })
      })
      // efectos secundarios DESPUÉS del commit: la transacción puede reintentarse y no queremos avisos duplicados
      notifier.newParticipant({ planId, userId }).catch(() => {})
      return participation
    }
  }
}
```

`container.js` es el único lugar que conoce las implementaciones concretas:

```js
const planRepo = createPlanRepository(PlanModel)
const participationService = createParticipationService({
  planRepo, participationRepo, withTransaction, notifier: fcmNotifier, clock: systemClock
})
```

En los tests se pasan fakes (`clock` fijo, `notifier` espía, repos en memoria). Ver [solid-y-modularidad.md](../practicas/solid-y-modularidad.md).

## Ejemplo completo de un endpoint

```js
// plan.routes.js — solo método + URL + cadena de middlewares
export function planRoutes ({ planController, authenticate }) {
  const router = express.Router()
  router.post('/', authenticate, validate({ body: createPlanSchema }), planController.create)
  router.patch('/:id', authenticate, validate({ params: idParam, body: updatePlanSchema }), planController.update)
  return router
}

// plan.controller.js — adapta HTTP, sin negocio
export function createPlanController ({ planService }) {
  return {
    async create (req, res) {
      const plan = await planService.create({ creatorId: req.user.id, data: req.body })
      res.status(201).json(serializePlan(plan))
    }
  }
}
```

Express 5 propaga los errores de funciones `async` al `errorHandler`: **no hace falta try/catch en controladores**. El servicio lanza `AppError` con un `code` del catálogo ([errores-y-logs.md](../practicas/errores-y-logs.md)) y el `errorHandler` lo traduce a `{ code, message, requestId }`.

## Middlewares (orden en `app.js`)

1. `requestId` — toma `X-Request-Id` de Nginx (o genera uno en desarrollo) y lo pone en `req.id`, en el logger y en la respuesta.
2. `httpLogger` — una línea por request: `requestId`, método, patrón de ruta (sin query string), status, duración. **Sin bodies, tokens ni coordenadas.** Va antes de `express.json` para que también quede logueada una request con JSON malformado.
3. `express.json({ limit: '100kb' })` — Nginx ya limita, esto es defensa en profundidad.
4. Rutas montadas bajo `/internal/...` (cada una con `authenticate`, `requireRole`, `validate` según corresponda).
5. `notFound` → 404 `NOT_FOUND`.
6. `errorHandler` → normaliza todo error.

## Socket.io

- Path del servidor: `/internal/socket.io` (Nginx publica `/api/v1/socket.io`).
- Auth en el handshake (`socket.handshake.auth.token`), misma verificación que el middleware HTTP.
- `join` a la sala `plan:<id>` solo si el usuario es participante activo o creador (lo decide el **servicio**, no el handler).
- Los handlers de `sockets/` son controladores: validan con Zod, llaman al servicio de mensajes y emiten. Detalle en [08-tiempo-real-y-push.md](08-tiempo-real-y-push.md).

## Sin estado local

No se guarda en memoria nada que otra instancia necesite: ni sesiones, ni salas, ni timers de negocio. Jobs programados (recordatorios, cierre de planes) se coordinan con un lock en Redis para que corran en una sola instancia ([pendientes](../pendientes.md#jobs-programados)).

## Configuración

`config/index.js` valida `process.env` con Zod al arrancar: si falta una variable, **el proceso no arranca**. En AWS los secretos se leen de Secrets Manager con el rol de la instancia; en desarrollo, de `.env` (que nunca se commitea). `.env.example` lista los nombres sin valores.
