# Health check del back independiente de Redis

- **Autor:** @paulastrimber
- **Fecha:** 2026-10-19T16:39:52-03:00

## Prompt

El health check del back (/internal/health en back-service/src/app.js) devuelve 503 si Redis no responde. Detrás del ALB interno, eso saca a todas las instancias si cae Redis y tumba la API, aunque el diseño dice que el chat debe seguir por polling. Cambiá el handler para que el código HTTP dependa solo de Mongo (503 si Mongo no responde) y Redis se siga informando en checks, con status 'degraded' cuando esté caído. Actualizá tests/contract/health.test.js, docs/arquitectura/06-api.md y anotá la decisión en docs/pendientes.md. Corré task ci y abrí un PR.

Actualiza main pues el PR ya esta mergeado. La alerta de presupuesto ya fue configurado en AWS
