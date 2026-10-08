# SOLID y modularidad

SOLID no es teoría para el parcial: cada principio resuelve un problema concreto de junte. Si una regla de acá choca con la realidad, se discute en un PR, no se ignora.

## S — Responsabilidad única

> Un módulo debería tener **un solo motivo para cambiar**.

| Pieza | Su único motivo para cambiar |
|-------|------------------------------|
| `plan.routes.js` | Cambia una URL o el orden de middlewares |
| `plan.controller.js` | Cambia cómo se mapea HTTP ↔ servicio (status, headers) |
| `plan.service.js` | Cambia una regla de negocio |
| `plan.repository.js` | Cambia cómo se consulta MongoDB |
| `plan.serializer.js` | Cambia la forma pública del JSON |
| `PlanCard.jsx` | Cambia cómo se ve un plan |
| `usePlan.js` | Cambia cómo se obtiene/actualiza un plan en la app |

**Señal de alarma:** un controlador con un `if` sobre `participantCount`, una screen con `axios.get`, un servicio que hace `res.status(...)`.

## O — Abierto/cerrado

> Extender agregando código, no modificando lo que funciona.

Ejemplo real: el **score del feed**. El informe pide pesos configurables sin cambiar el contrato.

```js
// feed/scorers.js — cada criterio es una función pura (plan, ctx) → [0, 1]
export const interestScorer  = (plan, { user }) => jaccard(user.interests, plan.interests ?? [])
export const proximityScorer = (plan, { radiusKm }) => Math.max(0, 1 - plan.distanceKm / radiusKm)
export const scheduleScorer  = (plan, { busy }) => busy == null ? 0.5 : (overlaps(plan, busy) ? 0 : 1)

// feed/feed.service.js
export function createFeedService ({ planRepo, scorers }) {   // scorers = [{ fn, weight }]
  return {
    async rank (candidates, ctx) {
      return candidates
        .map(plan => ({ plan, score: scorers.reduce((s, { fn, weight }) => s + weight * fn(plan, ctx), 0) }))
        .sort((a, b) => b.score - a.score)
    }
  }
}

// container.js — los pesos vienen de config (FEED_WEIGHTS=0.5,0.3,0.2)
const feedService = createFeedService({
  planRepo,
  scorers: [
    { fn: interestScorer, weight: config.feed.weights.interests },
    { fn: proximityScorer, weight: config.feed.weights.proximity },
    { fn: scheduleScorer, weight: config.feed.weights.schedule }
  ]
})
```

Agregar un criterio nuevo (p. ej. reputación del creador) = una función nueva + una línea en el container. El servicio no se toca.

## L — Sustitución de Liskov

> Cualquier implementación de una "interfaz" tiene que poder reemplazar a otra sin romper a quien la usa.

En JS no hay `interface`, pero sí contratos. Ejemplo: `notifier`.

```js
/** @typedef {{ newParticipant(e): Promise<void>, spotFreed(e): Promise<void>, reminder(e): Promise<void> }} Notifier */
const fcmNotifier  = createFcmNotifier({ fcm, deviceRepo })   // producción
const noopNotifier = { newParticipant: async () => {}, spotFreed: async () => {}, reminder: async () => {} } // tests / local
```

Ambas cumplen el mismo contrato (mismos métodos, devuelven promesas, **no lanzan** errores de red al servicio). Si `fcmNotifier` lanzara excepciones y `noopNotifier` no, se rompe Liskov y el servicio tendría que saber cuál le tocó.

Lo mismo con repositorios: el repositorio real (Mongoose) y uno en memoria para tests deben devolver los mismos tipos y lanzar los mismos `AppError`.

## I — Segregación de interfaces

> Nadie debería depender de métodos que no usa.

- Un servicio recibe **solo** las dependencias que usa. `createMessageService({ messageRepo, participationRepo, clock })` — no recibe "todo el container".
- Los módulos exponen en `index.js` lo mínimo. `participations/index.js` exporta `createParticipationService` y `isActiveParticipant`, no el modelo.
- En la app: un componente recibe props concretas (`title`, `startsAt`, `onPress`), no el objeto `plan` entero "por si acaso".

## D — Inversión de dependencias

> Lo de alto nivel (reglas de negocio) no depende de lo de bajo nivel (Mongo, FCM, S3, reloj). Ambos dependen de abstracciones.

- Servicios = **factories que reciben dependencias** (ver [03-back-service.md](../arquitectura/03-back-service.md#inyección-de-dependencias-sin-framework)).
- `container.js` es el único que hace `new`/`create` de implementaciones concretas.
- Hasta el **tiempo** se inyecta: `clock.now()` en lugar de `new Date()` dentro de un servicio. Así se testea "QR vencido" o "fuera de la ventana de check-in" sin esperar ni mockear globales.

```js
const fixedClock = { now: () => new Date('2026-10-25T18:05:00-03:00') }
const service = createCheckInService({ ..., clock: fixedClock })
```

## Modularidad: reglas prácticas

1. **Un módulo = una carpeta** con su `index.js` como única puerta de entrada.
2. **Sin imports circulares.** Si A necesita B y B necesita A, falta un tercer módulo o un evento.
3. **Funciones puras donde se pueda**: Haversine, Jaccard, cálculo de cursores, validación de ventana horaria. Son las más fáciles de testear y reutilizar.
4. **Efectos secundarios en los bordes**: notificaciones, logs de auditoría, envío de push van **después** del commit y fuera de la lógica central.
5. **Archivos chicos**: si un archivo pasa ~200 líneas o una función ~40, probablemente hace más de una cosa.
6. **Nombres que dicen qué hace**: `incrementIfCapacity`, no `update2`. Booleanos con `is/has/can`.

## Cómo se hace cumplir

- ESLint `import/no-restricted-paths`: `modules/*/` no puede importar archivos internos de otro módulo; `shared/` no importa `modules/`; servicios no importan `express` ni `mongoose`.
- Revisión de PR con el checklist de [definicion-de-hecho.md](../flujo/definicion-de-hecho.md).
- Si un servicio no se puede testear sin levantar Mongo, la dependencia está mal invertida.
