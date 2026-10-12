# Sprint 3: filtros, costo, planes llenos y aviso de cupo

- **Autor:** @paustever
- **Fecha:** 2026-10-12T11:57:57-03:00

## Prompt

Además de lo que respondí en las preguntas, quiero sumar esto al sprint 3. Antes de tocar el modelo o la API, proponeme cómo implementarlo y anotá en docs/pendientes.md lo que quede para más adelante.

1. Filtros del feed: por fecha, por intereses (tipo de actividad), solo con cupo libre / solo llenos, y por costo. Los filtros son predefinidos y la query se arma en el back (regla 8).

2. Costo del plan: hoy no existe en el modelo. Agregar un campo de precio (0 = gratis) en el plan, en POST/PATCH /plans y en el detalle. Es cambio de contrato y modelo: documentarlo en 06-api y 07-modelo, con su migración.

3. Planes llenos: "lleno" se calcula (participantCount >= capacity), no es un status. El feed principal muestra los planes con cupo; los llenos van en una sección aparte, donde se puede ver el detalle completo pero no inscribirse.

4. Aviso de cupo liberado: en un plan lleno, el usuario puede pedir que le avisen cuando se libere un lugar. Se avisa a todos los que lo pidieron y el primero que se inscribe se queda con el cupo (la transacción de cupos ya lo garantiza). Requiere guardar quién pidió aviso y depende de push (sprint 5): en este sprint dejarlo diseñado y anotado en pendientes; si da el tiempo, dejar armado el endpoint para pedir/cancelar el aviso.

5. Radio del feed: control en la app (slider o selector) para que el usuario elija el radio entre 0.5 y 50 km, por defecto 10, junto con los filtros.

6. Hora de fin: endsAt es obligatorio y lo ingresa el creador (posterior a startsAt, duración máxima 7 días para permitir campamentos). Se usa para H(u,p) y se muestra en el detalle.

7. Lugar: location.label obligatorio (1–120). Selector con mapa (react-native-maps): buscador de dirección con expo-location (sin Places) + botón "usar mi ubicación", y el mapa se centra con un pin arrastrable para ajustar el punto. La API key de Google Maps va restringida a la app y se documenta como excepción a la regla de secretos.

8. Compatibilidad horaria: además de las franjas del calendario que manda la app, el back cuenta como ocupados los planes en los que el usuario ya está inscripto, así funciona aunque no haya permiso de calendario.

Todo cambio de contrato o modelo se documenta en docs/ en el mismo PR.
