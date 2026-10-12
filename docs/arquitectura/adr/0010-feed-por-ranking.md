# 0010 · Feed por ranking: `POST /feed`, candidatos por cercanía y cursor por posición

- **Estado:** Aceptada
- **Fecha:** 2026-10-12

## Contexto

El feed ordena por un score (`0.5 · Jaccard + 0.3 · P(d) + 0.2 · H(u, p)`) que no es un campo de la base, así que no se puede paginar con un cursor sobre un índice como el resto de los listados. Además `H(u, p)` necesita saber cuándo está ocupado el usuario, y eso vive en el calendario del teléfono: el back no puede leerlo y un `GET` lo dejaría en la URL (y por lo tanto en los logs de acceso de Nginx y del ALB). El back no puede guardar estado entre requests (hay 2+ instancias) y los pesos tienen que poder cambiarse sin tocar el contrato.

## Decisión

1. **`POST /feed`** recibe por body la posición (`near`), el radio, los filtros predefinidos y, si la persona dio permiso, las franjas ocupadas de su calendario (`calendar`: período leído + hasta 200 franjas con solo inicio y fin). No se persiste ni se loguea. `GET /plans?near=` sigue existiendo con el mismo ranking, sin calendario.
2. **Candidatos:** `$geoNear` sobre el índice `2dsphere` trae los planes abiertos dentro de `radiusKm`, con su distancia en metros, hasta un **tope de 200** (los más cercanos). Los filtros (fecha, universidad, intereses, precio, cupo) se aplican en esa misma consulta.
3. **Ranking en memoria** con scorers puros y pesos de `FEED_WEIGHTS`. Desempates deterministas (distancia, inicio, id).
4. **Cursor opaco sin estado en el servidor:** codifica la posición en el ranking, el instante de la primera página (`asOf`) y una huella de la consulta. Cada página vuelve a traer y rankear los candidatos **creados hasta `asOf` y que empiezan después de `asOf`**, por lo que el conjunto es el mismo en todo el recorrido. Un cursor de otra consulta (huella distinta) o manipulado es 400.
5. **Compatibilidad horaria:** se superpone el horario del plan (`startsAt`–`endsAt`, por eso `endsAt` pasó a ser obligatorio) con las franjas del calendario **y con los planes en los que el usuario ya está inscripto**. 0 con superposición, 1 sin superposición dentro del período leído, 0.5 si no se sabe.

## Alternativas consideradas

- **Franjas ocupadas en el query de `GET /plans`** — quedarían en los logs de acceso y en el historial de URLs.
- **Que la app reordene con su calendario (`H = 0.5` en el back)** — el orden dejaría de coincidir con la paginación del servidor.
- **Guardar las franjas ocupadas en el perfil** — persiste datos personales que solo hacen falta un instante.
- **Guardar el ranking de cada usuario en Redis** y paginar sobre eso — paginación perfecta, pero estado por usuario con vencimiento, más memoria y una dependencia dura de Redis para leer el feed.
- **Cursor con solo un offset** — un plan creado entre páginas corre todo el ranking y produce duplicados; fijar `asOf` lo evita sin guardar nada.
- **Duración asumida de 2 h por plan** (sin `endsAt`) — imprecisa para un campamento o un café; se prefirió que el creador indique el fin.

## Consecuencias

- El feed funciona sin estado en el back y sin exponer el calendario; agregar un criterio al score es una función nueva y una línea en `buildScorers`.
- Cada página repite la consulta geográfica y el ranking (hasta 200 documentos): aceptable para el volumen esperado; si crece, medir antes de cachear.
- Con más de 200 planes dentro del radio, los más lejanos no se rankean hasta que el usuario achica el radio o filtra.
- Un plan creado después de la primera página aparece recién al refrescar. Si un plan se llena o se edita entre páginas, esa página puede saltear o repetir un elemento (la app descarta los repetidos).
- La app tiene que mandar exactamente la misma consulta en todas las páginas de un recorrido; al cambiar un filtro empieza de nuevo.
- `endsAt` es un campo obligatorio nuevo de `plans` (contrato, modelo y migración con backfill).
