# 0009 · Catálogos en la base de datos (intereses, universidades, carreras, ciudades y barrios)

- **Estado:** Aceptada
- **Fecha:** 2026-10-11

## Contexto

El perfil guardaba universidad, barrio y localidad como texto libre y los intereses como una lista fija en el código (`shared/interests.js`). Eso permite datos sucios ("UM", "Universidad de Montevideo", "um"), no sirve para cruzar usuarios (el feed compara intereses con Jaccard) y obliga a un deploy para sumar una opción. Se quiere además que el admin pueda agregar y editar intereses sin tocar código, ofrecer carreras de cada universidad y poner edad mínima a algunas opciones (bares, salir a bailar), porque la edad mínima de la app es 16.

## Decisión

Seis colecciones de **datos de referencia**: `interestCategories`, `interests`, `universities`, `careers`, `cities` y `neighborhoods`.

- El usuario guarda la **`key`** (inmutable, kebab-case): `university: 'um'`, `career: 'ingenieria-en-informatica'`, `interests: ['padel']`. El `name` que se muestra lo edita el admin sin migrar usuarios.
- Se **desactiva** (`active: false`) en lugar de borrar. Una opción desactivada deja de ofrecerse y no se puede elegir de nuevo, pero quien ya la tenía la conserva.
- **"Otra"** es la key reservada `other` (no una fila), sin texto libre. Válida en universidad, carrera, ciudad y barrio.
- Las carreras **cuelgan de la universidad** (`universityKey`) y el barrio de la ciudad. Al cambiar la de arriba se quita la de abajo.
- La validación de existencia/estado/pertenencia/edad mínima es una regla **pura** (`catalogs/catalog.rules.js`) que el servicio de usuarios aplica sobre el perfil resultante. Zod valida solo la forma de la key.
- `GET /catalogs` entrega a la app lo activo, anidado, con una `version` que cambia con el contenido.
- Lectura con **caché de 60 s por instancia** (datos de solo lectura; sin Redis ni invalidación entre instancias): un cambio del admin se ve en todas en menos de un minuto.
- **Carga inicial por migración** (`seed-catalogs`), no solo en los seeds de desarrollo, para que producción tenga los catálogos. Los datos están en `back-service/catalogs/` y `syncCatalogs` **solo inserta** (nunca pisa ediciones del admin). `npm run catalogs:sync` suma entradas nuevas a una base existente.
- Los intereses guardan keys, por eso los de los seeds viejos (`futbol`, `running`, `cine`…) se conservan como keys del catálogo y los usuarios existentes migran sin pérdida. Texto libre viejo de universidad/ciudad/barrio se convierte a su key si coincide, y si no pasa a `other`.
- Alcance inicial de datos: siete universidades con sus carreras **de grado** (relevadas de los sitios oficiales), la ciudad de Montevideo con sus 62 barrios (áreas del INE) y 8 categorías con 57 intereses.

## Alternativas consideradas

- **Enums en el código** — simple, pero cada cambio exige un deploy y el admin no puede editarlos.
- **Texto libre con sugerencias** — datos sucios y sin cruce confiable.
- **Guardar `ObjectId` en lugar de `key`** — menos legible en logs y seeds, y las keys estables ya resuelven el renombrado.
- **Carreras como lista global por área** — más barata de mantener, pero ofrece carreras que la universidad no dicta.
- **"Otra" con texto libre** — se descartó: vuelve el dato sucio y obliga a moderarlo.
- **Editar los catálogos solo con migraciones** — descartado: el admin tiene que poder hacerlo (S6).

## Consecuencias

- El CRUD de los catálogos en `/admin` entra en S6 (hoy solo hay lectura y carga inicial).
- Una migración mergeada no se edita, pero los datos iniciales viven en `catalogs/` y se aplican con `syncCatalogs`; la migración `seed-catalogs` toma los datos vigentes al correr en una base nueva.
- Las carreras relevadas pueden quedar desactualizadas (las universidades abren y cierran carreras): se corrigen sumando al archivo y corriendo `catalogs:sync`, o desde el admin.
- Las carreras de UCU se agrupan con áreas propias (su sitio no agrupa por facultad); las del resto, por facultad.
- La app depende de `GET /catalogs` para los selectores y los intereses: sin conexión muestra el error con "Reintentar" (el caché offline entra en S6).
