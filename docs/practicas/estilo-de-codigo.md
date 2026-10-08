# Estilo de código

Base: JavaScript ESM + **neostandard** ([ADR-0006](../arquitectura/adr/0006-javascript-esm-y-estilo.md)). El linter decide el formato; las revisiones discuten diseño, no espacios.

## Lenguaje

- `const` por defecto, `let` si se reasigna. **Nunca `var`.**
- Módulos ESM: `import`/`export`, extensión `.js` explícita en imports relativos, prefijo `node:` para módulos nativos (`import crypto from 'node:crypto'`).
- Exports **nombrados** (`export function createPlanService`). `export default` solo para componentes de pantalla de React Native si la navegación lo requiere.
- `async`/`await` siempre; nada de callbacks ni cadenas largas de `.then()`. Una promesa que no se espera (fire-and-forget) se marca explícitamente con `.catch(...)`.
- Igualdad estricta `===`/`!==`.
- Optional chaining y nullish coalescing (`user?.photoKey ?? null`) en lugar de `&&` encadenados o `||` con valores falsy válidos (`0`, `''`).
- Spread para copias inmutables (`{ ...plan, title }`), nunca mutar argumentos recibidos.
- `map`/`filter`/`find`/`some` en lugar de `for` con acumuladores, salvo que el rendimiento lo justifique.

## Nombres

| Qué | Convención | Ejemplo |
|-----|-----------|---------|
| Variables y funciones | camelCase, verbo para funciones | `participantCount`, `incrementIfCapacity()` |
| Factories | `create` + nombre | `createPlanService` |
| Componentes React | PascalCase | `PlanCard`, `CheckInScreen` |
| Hooks | `use` + nombre | `useJoinPlan` |
| Constantes de configuración | UPPER_SNAKE | `MAX_PAGE_SIZE` |
| Archivos del back | `<entidad>.<capa>.js` | `plan.service.js`, `plan.service.test.js` |
| Archivos de la app | PascalCase para componentes, camelCase el resto | `PlanCard.jsx`, `useJoinPlan.js` |
| Booleanos | `is/has/can` | `isActiveParticipant`, `canCheckIn` |
| Campos de la API y la DB | inglés, camelCase | `startsAt`, `checkInRadiusMeters` |
| Códigos de error | UPPER_SNAKE en inglés | `PLAN_FULL` |

**Idioma:** código, campos, códigos de error y commits en inglés; documentación, mensajes al usuario (`message`) y comentarios explicativos en español.

## Funciones

- Una función hace una cosa. Si el nombre necesita "y", son dos.
- Máximo ~3 parámetros posicionales; si son más, un objeto con destructuring: `create({ creatorId, data })`.
- Retornos tempranos (*guard clauses*) en vez de `if` anidados.
- Sin valores mágicos: `const QR_TTL_SECONDS = 90`, no `90` suelto.

## Comentarios

- Explican el **porqué**, no el qué. `// $expr porque necesitamos comparar dos campos del mismo documento` sí; `// incrementa el contador` no.
- JSDoc en funciones públicas de servicios y repositorios (parámetros y errores que pueden lanzar).
- `TODO` solo con referencia a una tarea: `// TODO(S4-BE-07): ...`.

## Errores

- Errores de negocio con `AppError` y un `code` del catálogo ([errores-y-logs.md](errores-y-logs.md)). Nunca `throw 'string'` ni `throw new Error('cupo lleno')` para un caso esperado.
- No tragar errores (`catch {}` vacío). Si se ignora a propósito, se comenta por qué y se loguea.

## React Native

- Componentes de función con hooks; nada de clases.
- Estilos con `StyleSheet.create` al final del archivo; nada de estilos inline salvo valores dinámicos.
- Layout con Flexbox; tamaños relativos antes que píxeles fijos.
- Dependencias completas en `useEffect`/`useMemo`/`useCallback` (lo controla `react-hooks/exhaustive-deps`).
- Textos visibles al usuario centralizados por pantalla (preparado para i18n aunque no se implemente).

## Lint y formato

- `npm run lint` en cada paquete; `npm run lint -- --fix` arregla lo automático.
- CI falla si hay errores de lint.
- No se desactiva una regla con `eslint-disable` sin comentario que explique por qué.
