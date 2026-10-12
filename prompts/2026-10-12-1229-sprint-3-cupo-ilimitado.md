# Sprint 3: cupo ilimitado

- **Autor:** @paustever
- **Fecha:** 2026-10-12T12:29:11-03:00

## Prompt

Cambio en planes: el cupo puede ser ilimitado. capacity pasa a ser opcional: entero 1–500, o null = sin límite. Un plan sin límite nunca está lleno (isFull=false, availableSpots=null, no aparece con availability=full). En PATCH se puede pasar de ilimitado a un número (no menor a participantCount → 409) o al revés. En la app, interruptor “Cupo ilimitado” al crear/editar y mostrar “Sin límite”. Actualizá validador, migración, 06-api y 07-modelo, y avisame si afecta algo de S4 (inscripción con cupo transaccional).
