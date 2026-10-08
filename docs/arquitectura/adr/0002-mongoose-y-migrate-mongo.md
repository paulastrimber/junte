# 0002 · Mongoose como ODM y migrate-mongo para versionar la DB

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

MongoDB no tiene esquema obligatorio, pero junte sí depende de estructura: índices únicos que garantizan invariantes (inscripción única, check-in único, email único), un índice `2dsphere`, validadores y, con el tiempo, cambios de datos (backfills como agregar `role` y `status` a usuarios existentes). Si cada desarrollador crea índices a mano o los deja a `autoIndex`, los entornos divergen y no hay historial.

## Decisión

- **Mongoose** como ODM: esquemas, tipos, `timestamps`, sesiones para transacciones.
- **migrate-mongo** para versionar la base: cada cambio de índices, validadores o datos es un archivo con `up` y `down`, registrado en la colección `changelog`.
- Mongoose con `autoIndex: false` y `autoCreate: false`: **la única fuente de índices son las migraciones**.

## Alternativas consideradas

- **Driver nativo**: más control, pero más código repetido y sin esquema en el back.
- **`autoIndex` de Mongoose**: crea índices al arrancar, sin historial ni rollback, y en producción puede bloquear al iniciar con colecciones grandes.
- **Scripts sueltos**: sin registro de qué se aplicó en cada entorno.

## Consecuencias

- Hay que escribir una migración cada vez que se agrega un índice o cambia un dato existente.
- Los tests de integración aplican las migraciones sobre la base en memoria, así se prueban también.
- Reglas detalladas en [practicas/migraciones.md](../../practicas/migraciones.md).
