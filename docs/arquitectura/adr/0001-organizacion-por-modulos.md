# 0001 · Back service organizado por módulos de dominio

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

El informe (sección 6) propone `back-service/` con carpetas por tipo: `routes/`, `controllers/`, `services/`, `models/`, `validators/`… Con ~11 áreas funcionales (auth, users, plans, participaciones, check-in, feed, chat, reportes, devices, uploads, admin), una carpeta por tipo termina con decenas de archivos no relacionados entre sí, y cambiar una funcionalidad obliga a tocar cinco carpetas. El equipo pidió una arquitectura modular.

## Decisión

Agrupar por **módulo de dominio** en `src/modules/<modulo>/`, y dentro de cada módulo mantener exactamente las capas que pide el informe (`*.routes.js`, `*.controller.js`, `*.service.js`, `*.model.js` + `*.repository.js`, `*.validators.js`) más `*.serializer.js` (la "vista" del MVC). Lo transversal queda en carpetas propias tal como en el informe: `middlewares/`, `sockets/`, `adapters/`, `config/`.

Cada módulo expone su API pública en `index.js`; otros módulos solo importan desde ahí.

## Alternativas consideradas

- **Por capas (tal cual el informe)**: más simple al principio, pero acopla todo y escala mal.
- **Microservicios por dominio**: fuera de alcance; complejidad operativa injustificada.

## Consecuencias

- Las capas y el flujo `ruta → middleware → controlador → servicio → modelo` del informe se conservan; cambia solo la agrupación. Se puede explicar la equivalencia en la defensa del proyecto.
- Un módulo se puede leer, testear y revisar de forma aislada.
- Hay que hacer cumplir las fronteras con ESLint (`import/no-restricted-paths`).
- Hay que actualizar la sección 6 del informe o aclarar la equivalencia.
