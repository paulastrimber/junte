// Carga inicial de los catálogos (catalogs/): intereses, universidades, carreras, ciudades y barrios.
// Solo inserta lo que falta (nunca pisa lo que el admin editó) y corre en todo entorno, producción incluida.
// Los datos viven en catalogs/*.js, no acá: para sumar o corregir entradas se edita ese archivo y se corre
// `npm run catalogs:sync` (o se usa el panel de administración). Esta migración no se vuelve a ejecutar.
// `down` no borra datos: no puede distinguir lo que cargó de lo que el admin agregó después.
import { syncCatalogs } from '../catalogs/index.js'

export async function up (db) {
  await syncCatalogs(db)
}

export async function down () {
  // Conserva los datos (ver arriba). `create-catalogs.down` quita índices y validadores.
}
