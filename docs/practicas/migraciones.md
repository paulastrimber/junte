# Migraciones y versionado de la base de datos

Decisión en [ADR-0002](../arquitectura/adr/0002-mongoose-y-migrate-mongo.md). Herramienta: **migrate-mongo**.

## Por qué migraciones en MongoDB si "no tiene esquema"

Porque junte sí tiene esquema: los invariantes más importantes (un email por cuenta, una inscripción por par, un check-in por persona, búsqueda geoespacial) **dependen de índices**. Si un entorno no tiene el índice único, el bug no aparece hasta producción. Las migraciones hacen que todos los entornos tengan exactamente la misma estructura y que haya historial de cada cambio.

## Qué va en una migración

| Sí | No |
|----|----|
| Crear/eliminar índices (`createIndex`, `dropIndex`) | Datos de prueba (eso va en `seeds/`) |
| Validadores `$jsonSchema` (`collMod`) | Lógica de negocio |
| Backfills: agregar un campo con default a documentos existentes (`role: 'user'`) | Cambios que dependen de servicios externos |
| Renombrar campos o transformar datos | Crear el usuario admin (es un script operativo) |
| Crear colecciones con opciones especiales | |

## Cómo funciona el versionado

- Cada migración es un archivo `migrations/<timestamp>-<descripcion>.js` (ej. `20261008120000-create-users-indexes.js`). **El timestamp ordena la ejecución.**
- migrate-mongo guarda en la colección **`changelog`** qué archivos se aplicaron y cuándo. Al correr `up`, aplica solo los que faltan, en orden.
- Un lock evita que dos procesos migren a la vez (importante con 2 instancias del back).
- La versión de la base = la última migración aplicada (`migrate-mongo status`).

## Configuración

```js
// back-service/migrate-mongo-config.js
export default {
  mongodb: {
    url: process.env.MONGO_URI,               // en AWS se arma desde Secrets Manager antes de llamar
    databaseName: process.env.MONGO_DB_NAME
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  lockCollectionName: 'changelog_lock',
  lockTtl: 300,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm'
}
```

## Anatomía de una migración

```js
// migrations/20261008120000-create-plan-participants-indexes.js
export async function up (db) {
  await db.collection('planParticipants').createIndex(
    { planId: 1, userId: 1 },
    { unique: true, name: 'planId_userId_unique' }
  )
  await db.collection('planParticipants').createIndex(
    { userId: 1, status: 1 },
    { name: 'userId_status' }
  )
}

export async function down (db) {
  await db.collection('planParticipants').dropIndex('planId_userId_unique')
  await db.collection('planParticipants').dropIndex('userId_status')
}
```

Backfill con `role` y `status` ([ADR-0004](../arquitectura/adr/0004-rol-y-estado-de-usuario.md)):

```js
export async function up (db) {
  await db.collection('users').updateMany({ role: { $exists: false } }, { $set: { role: 'user' } })
  await db.collection('users').updateMany({ status: { $exists: false } }, { $set: { status: 'active' } })
}
export async function down (db) {
  await db.collection('users').updateMany({}, { $unset: { role: '', status: '' } })
}
```

## Reglas

1. **Toda migración tiene `up` y `down`.** Si algo es irreversible (borrar datos), el `down` lanza un error explicando por qué y el PR lo justifica.
2. **Una migración mergeada no se edita nunca.** Si estaba mal, se escribe otra que la corrige. Editarla haría que los entornos donde ya corrió queden distintos de los nuevos.
3. **Una migración = un cambio lógico.** "Índices de users" y "backfill de role" van en archivos separados.
4. **Idempotentes cuando se pueda**: `createIndex` lo es; los backfills filtran con `$exists: false`.
5. **Índices con `name` explícito**, para que el `down` pueda borrarlos sin adivinar.
6. **Mongoose con `autoIndex: false` y `autoCreate: false`.** Si un índice no está en una migración, no existe.
7. **El esquema de Mongoose y las migraciones van en el mismo PR** cuando cambia un campo.
8. **Backfills grandes en lotes** (`bulkWrite` por bloques), no un `updateMany` que bloquee la colección (no aplica hoy, sí si el volumen crece).

## Cambios compatibles

Durante un despliegue hay instancias con el código viejo y la migración ya aplicada. Por eso los cambios incompatibles se hacen en **dos pasos** (*expand / contract*):

| Cambio | Paso 1 (release N) | Paso 2 (release N+1) |
|--------|-------------------|----------------------|
| Renombrar `photoKey` → `photoObjectKey` | Migración copia el valor al campo nuevo; el código escribe ambos y lee el nuevo | Migración elimina el campo viejo; el código deja de escribirlo |
| Campo nuevo obligatorio | Migración con default; el código lo acepta opcional | El código lo exige |
| Índice único nuevo | Migración que limpia duplicados, luego crea el índice | — |

## Comandos (vía Taskfile)

| Comando | Qué hace |
|---------|----------|
| `task db:migrate:create -- nombre-descriptivo` | Crea el archivo con timestamp |
| `task db:migrate` | Aplica todas las pendientes |
| `task db:migrate:down` | Revierte **la última** |
| `task db:migrate:status` | Lista aplicadas y pendientes |
| `task db:seed` | Carga datos de desarrollo (nunca en AWS) |

## Dónde corren

- **Local:** a mano con `task db:migrate` después de `task up`.
- **Tests:** el helper de tests aplica todas las migraciones sobre `MongoMemoryReplSet` antes de la suite.
- **CI:** `up → down → up` sobre una base vacía, para verificar que los `down` funcionan.
- **AWS:** un paso del despliegue, **antes** de actualizar las instancias del back. Nunca al arrancar la app (con dos instancias arrancando a la vez, compiten).
