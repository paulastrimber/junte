# 0007 · Vitest en el back, jest-expo en la app

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

El back es ESM puro y necesita tests de servicios, de integración con MongoDB (con transacciones, o sea replica set) y de contrato HTTP. La app es Expo/React Native.

## Decisión

| Ámbito | Herramienta |
|--------|-------------|
| Back: runner | **Vitest** (ESM nativo, sin configuración experimental) |
| Back: HTTP | **Supertest** sobre `app.js` |
| Back: MongoDB | **mongodb-memory-server** con `MongoMemoryReplSet` (1 nodo) |
| App: runner | **jest-expo** (preset oficial de Expo) |
| App: componentes y hooks | **@testing-library/react-native** |
| App: E2E | **Maestro** (flujos críticos, sprint 7) |
| Front service | `nginx -t` + `tests/smoke.sh` |

## Alternativas consideradas

- **Jest en el back**: el soporte ESM sigue requiriendo flags experimentales.
- **`node:test`**: sin dependencias, pero con menos ergonomía (mocks, watch, cobertura).
- **Detox para E2E**: más potente, bastante más difícil de configurar con Expo.

## Consecuencias

- Dos runners distintos, pero con API casi idéntica (`describe`, `it`, `expect`).
- Estrategia y reglas en [practicas/testing.md](../../practicas/testing.md).
