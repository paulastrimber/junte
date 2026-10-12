# Decisiones de arquitectura (ADR)

Un ADR registra **una** decisión importante, por qué se tomó y qué cuesta. Sirve para no rediscutir lo mismo cada semana y para que alguien nuevo entienda el porqué.

## Cuándo escribir uno

Cuando la decisión es difícil de revertir o afecta a más de un módulo: elegir una librería central, cambiar una convención de la API, una regla de seguridad, la topología de red.

## Índice

| # | Decisión | Estado |
|---|----------|--------|
| [0001](0001-organizacion-por-modulos.md) | Back service organizado por módulos de dominio | Aceptada |
| [0002](0002-mongoose-y-migrate-mongo.md) | Mongoose como ODM y migrate-mongo para versionar la DB | Aceptada |
| [0003](0003-socketio-solo-websocket.md) | Socket.io solo con transporte WebSocket, sin stickiness | Aceptada |
| [0004](0004-rol-y-estado-de-usuario.md) | `role` y `status` en `users` | Aceptada |
| [0005](0005-nat-por-zona.md) | Un NAT Gateway por zona de disponibilidad | Aceptada |
| [0006](0006-javascript-esm-y-estilo.md) | JavaScript ESM + neostandard en todo el código | Aceptada |
| [0007](0007-herramientas-de-testing.md) | Vitest en el back, jest-expo en la app | Aceptada |
| [0008](0008-sesiones-multiples.md) | Una sesión por dispositivo (colección `sessions`) | Aceptada |
| [0009](0009-catalogos-en-la-base.md) | Catálogos (intereses, universidades, carreras, ciudades, barrios) en la base | Aceptada |
| [0010](0010-feed-por-ranking.md) | Feed por ranking: `POST /feed`, candidatos por cercanía y cursor por posición | Aceptada |

## Reglas

- Numeración correlativa, nunca se reutiliza un número.
- Un ADR aceptado **no se edita**: si cambia la decisión, se escribe uno nuevo que lo reemplaza y el viejo pasa a "Reemplazada por XXXX".
- Va en el mismo PR que el cambio que motiva.

## Plantilla

```markdown
# NNNN · Título en forma de decisión

- **Estado:** Propuesta | Aceptada | Reemplazada por NNNN
- **Fecha:** AAAA-MM-DD

## Contexto
Qué problema hay y qué restricciones aplican.

## Decisión
Qué se decidió, en una o dos frases claras.

## Alternativas consideradas
- Opción A — por qué no.
- Opción B — por qué no.

## Consecuencias
Qué se gana, qué se pierde, qué hay que hacer a partir de ahora.
```
