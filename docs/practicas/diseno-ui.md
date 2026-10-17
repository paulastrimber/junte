# Diseño de la interfaz (app móvil)

Cómo se ve y cómo se siente junte, y las reglas para que todas las pantallas hablen igual. El sistema vive en `mobile/src/theme/` (valores) y `mobile/src/components/` (piezas). Las pantallas **arman** con esas piezas: no definen colores, tamaños de letra ni sombras propias.

> Fuente de los valores: [`colors.js`](../../mobile/src/theme/colors.js), [`tokens.js`](../../mobile/src/theme/tokens.js), [`typography.js`](../../mobile/src/theme/typography.js). Si este documento y el código no coinciden, uno de los dos tiene un bug.

## Identidad

junte es para juntarse: un partido de fútbol 5 en el Parque Rodó, una salida después del parcial, un grupo de estudio en la biblioteca de la facultad. La interfaz tiene que sentirse como un **plan entre amigos**, no como un sistema de reservas.

1. **Violeta para actuar, lima para celebrar.** El violeta (`primary`) marca lo que se toca y lo que importa. El lima (`accent`) aparece poco y siempre como relleno: el punto del logo, "Gratis", el visor del QR. Si todo es lima, nada lo es.
2. **El plan es una entrada.** La `PlanCard` tiene la forma de un ticket: qué, cuándo y dónde arriba; cuánto sale y si queda lugar abajo, separados por un corte con muescas. Es el único gesto "gráfico" fuerte de la app; el resto acompaña en silencio.
3. **Jerarquía con la tipografía, no con cajas.** Plus Jakarta Sans en cinco pesos alcanza para ordenar una pantalla: un título fuerte, datos en `bodyStrong`, detalles en `caption`. Antes de agregar un borde o una tarjeta, probar con peso y espacio.
4. **Hablamos de vos.** Voseo rioplatense, frases cortas, verbos concretos: "Inscribirme", "Buscá una dirección", "Probá con una distancia mayor". Sin "Error:" ni "¡Ups!". Un error dice qué pasó y qué hacer; un vacío invita a hacer algo.
5. **Táctil y honesto.** Todo lo que se toca responde (se achica un poco al apretar, onda en Android, vibración corta en iOS cuando se elige algo). Nada se confirma en pantalla hasta que el servidor lo acepta.

## Color

Los colores se piden **por rol** (`colors.primary`), nunca por valor. `colors.js` es el único archivo con hexadecimales; cada rol tiene su par claro/oscuro y los pares de texto cumplen AA (4.5:1), lo que verifica `theme.test.js`.

| Rol | Para qué | Nunca |
|-----|----------|-------|
| `background` | Fondo de las pantallas y de las listas | Dentro de una tarjeta |
| `surface` | Tarjetas, campos, hojas, barra de tabs | — |
| `surfaceAlt` | Pistas (control segmentado), esqueletos, campo deshabilitado, `Badge` neutral | Como fondo de pantalla |
| `border` | Separar superficies (tarjeta en oscuro, líneas, corte de la `PlanCard`) | Como contorno de un control: no llega a 3:1 |
| `borderStrong` | Contorno de lo que se toca: `FormField`, `FieldButton`, `Chip`, botón `secondary` (≥ 3:1) | Para decorar |
| `text` / `textMuted` | Texto principal / secundario (rótulos, ayudas, metadatos) | `textMuted` para algo que hay que leer sí o sí |
| `primary` / `onPrimary` | Botón principal, chip elegido, íconos de acción, encabezados de navegación | Para texto largo |
| `primarySoft` / `onPrimarySoft` | Avisos informativos, círculos de ícono, fila elegida de una lista, avatar sin foto | — |
| `accent` / `onAccent` | Relleno lima con texto oscuro: punto de la marca, `Badge` "Gratis", visor del QR | **Como color de texto o de ícono sobre fondo claro** (1.2:1) |
| `accentEdge` | Borde del lima cuando cae sobre fondo claro (en oscuro es el mismo lima) | Solo |
| `success` / `successSoft` | Asistencia registrada, cambios guardados | Para "hay lugar" (eso es `primary`) |
| `warning` / `warningSoft` | Avisos que no bloquean (sin ubicación, polling del chat) | Para errores |
| `danger` / `dangerSoft` | Errores, plan lleno o cancelado, acciones destructivas | Para llamar la atención sobre algo que no es un problema |
| `scrim` | Fondo detrás de hojas modales | — |
| `ripple` | Onda de Android al tocar y halo de foco de los campos | — |
| `media` | Fondo de la cámara y de medios a pantalla completa (oscuro en los dos modos) | — |

**Reglas**
- Un solo botón `primary` visible por pantalla. Lo demás, `secondary` o `ghost`.
- El color nunca es la única señal: un chip marcado lleva tilde, un error lleva ícono y texto, un `Badge` dice su estado en palabras.
- Un rol nuevo se agrega en los dos modos a la vez (el test falla si no) y, si es texto, se suma su par a `TEXT_PAIRS`; si es un borde o gráfico, a `UI_PAIRS` (3:1).

## Tipografía

Plus Jakarta Sans, un archivo por peso (`fonts.regular` … `fonts.extrabold`). El peso se elige con la familia, nunca con `fontWeight`. Las pantallas usan `<Text variant='…'>`, nunca un `fontSize`.

| Variante | Familia · tamaño / interlínea | Uso |
|----------|-------------------------------|-----|
| `display` | ExtraBold 30/36, −0.6 | Una vez por pantalla como mucho: bienvenida, resultado de un check-in |
| `title` | Bold 24/30 | Título de pantalla sin encabezado de navegación, título de una hoja, nombre del plan en el detalle |
| `heading` | Bold 18/24 | Títulos de sección (`SectionHeader`), título de tarjeta, título de estados vacíos y de error |
| `body` | Regular 16/24 | Texto corrido, descripciones |
| `bodyStrong` | SemiBold 16/24 | Valores de datos (`DetailRow`), texto de botones |
| `label` | SemiBold 14/20 | Etiquetas de campos, chips, renglones de la `PlanCard`, avisos |
| `caption` | Medium 13/18 | Ayudas, errores de campo, metadatos, hora de mensajes |
| `micro` | SemiBold 11/14 | `Badge` y barra de tabs. Nunca para frases |
| `stat` | ExtraBold 28/32, cifras tabulares | Números protagonistas: reputación, inscriptos |
| `overline` | Bold 12/16, mayúsculas | Con moderación. Para títulos de sección se usa `SectionHeader`, en minúscula de oración |

**Texto grande del sistema (Dynamic Type / tamaño de fuente de Android).** El texto **siempre** escala (`allowFontScaling` queda en `true`). `Text` aplica un tope por variante (`fontScaleLimits`: `display` 1.3, `title` y `stat` 1.4, `heading` 1.6, el resto 2) para que los títulos no se partan en cinco renglones. Única excepción: la inicial del `Avatar`, que escala con el círculo. Los contenedores usan `minHeight` (no `height`) para crecer con el texto.

## Espaciado

Grilla de 4 (`spacing`): `xxs` 2 · `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 24 · `xxl` 32 · `xxxl` 48.

- Borde de pantalla: `xl` (24) en formularios y detalle (`Screen`), `lg` (16) en listas.
- Dentro de un bloque (rótulo + valor, título + bajada): `xxs`–`xs`. Entre elementos de un grupo: `sm`. Entre bloques: `lg`. Entre secciones: `xl`.
- Se separa con `gap`, no con márgenes. Un valor entre dos pasos se redondea al paso más cercano (nada de `spacing.sm + 2`).

## Radios, bordes y elevación

- **Radios** (`radius`): `sm` 8 etiquetas y burbujas · `md` 12 campos, avisos y filas · `lg` 14 botones · `xl` 18 tarjetas y mapa · `xxl` 24 hojas y visor del QR · `pill` chips, badges y círculos. Más grande el elemento, más redondo. Siempre con `borderCurve: 'continuous'`.
- **Bordes** (`borders`): `thin` 1 separa superficies · `thick` 1.5 contorno de controles · `heavy` 3 costado de los avisos (`Notice`).
- **Elevación** (`shadows`, por modo): `card` para tarjetas sobre el fondo y `raised` para lo que flota (segmento elegido). Son `boxShadow` teñidos de violeta. En oscuro no hay sombras: la separación la da `border`. Nunca `elevation` ni `shadow*`.

## Motion y respuesta al toque

`motion`: `fast` 150 ms (respuesta a un toque) · `base` 250 ms (algo que entra o sale) · `slow` 900 ms (pulso de los esqueletos) · `pressScale` 0.97.

- **Apretar** es instantáneo: lo que se toca se achica a `pressScale` y baja un poco la opacidad (estilo `pressed`). En Android, además, onda `android_ripple` con `colors.ripple`.
- **Vibración** (`components/haptics.js`, solo iOS): `selectionFeedback` al elegir un chip o un segmento (ya lo hacen `Chip` y `ChipGroup`), `tapFeedback` con `<Button haptic>` en la acción principal de una pantalla (inscribirse, enviar), `successFeedback` cuando algo que se esperaba sale bien (asistencia registrada, plan creado).
- **Movimiento que no pidió nadie**: solo el pulso del `Skeleton`. Con "Reducir movimiento" (`useReducedMotion`) se queda quieto.
- Hojas y modales usan la animación nativa (`animationType='slide'`; en iOS, `presentationStyle='pageSheet'`). No se animan entradas de cada tarjeta ni de cada sección.

## Componentes base

Todos aceptan `style` solo para ubicarlos (margen, flex), nunca para cambiar su identidad: si una pantalla necesita otro color, falta una variante.

| Componente | Para qué | Props principales |
|------------|----------|-------------------|
| `Text` | Todo texto | `variant`, `color` (rol), `center`, + props de `Text` (`selectable`, `numberOfLines`…) |
| `Icon` | Ionicons decorativo (oculto al lector) | `name`, `size` (`sizes.icon*`), `color` (rol) |
| `Button` | Acciones | `title`, `onPress`, `variant` (`primary` · `secondary` · `ghost` · `danger`), `size` (`md` · `sm`), `icon`, `loading`, `disabled`, `haptic`, `accessibilityLabel`, `accessibilityHint`, `testID` |
| `Chip` | Una opción que se marca | `label`, `selected`, `onPress`, `role` (`checkbox` · `radio`), `disabled`, `icon` |
| `ChipGroup` | Grupo de opciones | `label`, `options`, `selected`, `onSelect`, `multiple`, `variant` (`chips` · `segmented`), `hideLabel` |
| `InterestPicker` | Intereses por categoría (máximo `MAX_INTERESTS`) | `categories`, `selected`, `onToggle` |
| `FormField` | Campo de texto | `label`, `icon`, `hint`, `error`, `multiline`, + props de `TextInput` |
| `FieldButton` | Campo que se elige (abre un selector) | `label`, `value`, `placeholder`, `onPress`, `icon`, `hint`, `error`, `disabled`, `children` |
| `DateField` / `DateTimeField` | Fecha / fecha y hora | `label`, `value`, `onChange`, `error` (+ `minimumDate`, `defaultDate`) |
| `SelectField` | Una opción de una lista con buscador y "Otra" | `label`, `value`, `options`, `onChange`, `allowOther`, `disabled`, `hint`, `error` |
| `LocationPicker` | Lugar del plan: dirección, mi ubicación y mapa | `coordinates`, `onChange`, `address`, `onSearch`, `onUseMyLocation`, `isWorking`, `message`, `error` |
| `Card` | Superficie que agrupa | `variant` (`elevated` · `outlined` · `tinted`), `padding` (`md` · `lg`), `onPress` + `accessibilityLabel` |
| `PlanCard` | Plan en una lista (ticket) | `id`, `title`, `schedule`, `place`, `distance`, `price`, `spots`, `isFull`, `isFree`, `spotsTone`, `onPress` |
| `Badge` | Estado corto que no se toca | `label`, `tone` (`neutral` · `primary` · `accent` · `success` · `warning` · `danger`), `icon` |
| `DetailRow` | Un dato con rótulo e ícono | `label`, `value`, `icon`, `hint` |
| `SectionHeader` | Título de sección dentro de la pantalla | `title`, `description`, `actionTitle` + `onAction` |
| `Avatar` | Foto o inicial | `photoUrl`, `name`, `size` (`sizes.avatarSm` · `avatarMd` · `avatarLg`), `accessibilityLabel`, `decorative` |
| `Notice` | Aviso dentro de la pantalla | `message`, `tone` (`info` · `success` · `warning` · `danger`), `title`, `icon`, `children` |
| `ErrorBanner` | Error de un formulario, de una acción o de un refresco | `error` (el `ViewError` del hook) o `message` + `requestId` (solo en desarrollo), `title` |
| `FieldError` | Error de un dato que no es un `FormField` (intereses, cupo ilimitado), con el mismo aspecto | `message` |
| `LoadingState` | Cargando (indicador + qué se espera) | `label`, `fill` |
| `Skeleton` / `PlanCardSkeleton` | Lugar del contenido mientras carga | `width`, `height`, `radius` / `label`, `count` |
| `EmptyState` | Vacío o no disponible, con el punto lima | `title`, `message`, `icon`, `actionTitle` + `onAction`, `actionVariant`, `tone` (`brand` · `danger`), `fill` |
| `ErrorState` | La pantalla (o un bloque) no se pudo cargar | `title`, `error` (o `message` + `requestId`), `onRetry`, `retryTitle`, `children`, `fill` |
| `Screen` | Pantalla con formulario: scroll + teclado | `safeTop`, `footer` (acciones fijas abajo) |
| `Wordmark` | El logo: "junte" con el punto lima | `size` |
| `QrScanner` | Cámara que lee QR, con visor | `onScan`, `paused` |
| `CatalogGate` | Espera a los catálogos | `status`, `onRetry`, `children` |
| `StudyFields` | Universidad, carrera, ciudad y barrio (onboarding y perfil, mismos textos) | `values`, `options`, `dependents`, `errors`, `onChange` |

Cuándo crear uno nuevo: cuando el mismo bloque aparece en **dos o más pantallas**, tiene un nombre claro y su API es más chica que su implementación. Mientras tanto, vive en la pantalla.

## Los cuatro estados

Toda pantalla (y todo bloque que carga solo, como "Quiénes van") contempla los cuatro:

| Estado | Lista (feed, mis planes) | Detalle o bloque |
|--------|--------------------------|------------------|
| **Cargando** | `PlanCardSkeleton` con el texto de qué se espera ("Buscando planes…"); los filtros siguen arriba | `LoadingState fill` (pantalla) o `LoadingState` (bloque) |
| **Vacío** | `EmptyState` que diga qué hacer ("Probá con una distancia mayor") y, si hay algo para hacer, la acción | `EmptyState` con `tone='danger'` si el recurso ya no está ("Este plan no está disponible") |
| **Error** | `ErrorState` con `onRetry`; arriba, los filtros como `children` para poder cambiarlos | `ErrorState fill` en pantalla; `Notice tone='danger'` + botón `sm` en un bloque |
| **Con datos** | `FlatList` de `PlanCard` sobre `colors.background`; al final, "cargando más" con `ActivityIndicator` y error con `ErrorBanner` + "Reintentar" | Contenido |

Errores de un formulario o de una acción (inscribirse, guardar) no reemplazan la pantalla: van en un `ErrorBanner` cerca del botón que los causó.

## Accesibilidad

- **Tamaño táctil ≥ 48** (`sizes.touch`). Lo que dibuja menos (botón `sm`, `Chip`, segmento: 40) completa los 48 con `hitSlop`. Un ícono que se toca va dentro de un área de 48.
- **Rol y nombre** en todo lo que se toca: `accessibilityRole` (`button`, `checkbox`, `radio`, `header`…) y `accessibilityLabel` cuando el texto visible no alcanza. Los íconos son decorativos: el control que los contiene lleva su propio nombre.
- **Estado**: `accessibilityState` (`disabled`, `checked`, `selected`, `busy`) y `accessibilityValue` para el valor elegido de un selector (`FieldButton`).
- **Un dato, un anuncio**: `DetailRow` y `PlanCard` agrupan su contenido; `Avatar decorative` cuando el nombre ya está escrito al lado.
- **Errores y cambios**: los errores llevan `accessibilityRole='alert'`; los avisos que aparecen solos (guardado, asistencia registrada) `accessibilityLiveRegion='polite'`.
- **Contraste**: texto ≥ 4.5:1 y contorno de controles ≥ 3:1 en los dos modos (lo prueba `theme.test.js`). Nada de texto lima sobre fondo claro.
- **Modo oscuro**: todo color sale de `useTheme()` / `createThemedStyles`, así que cambia solo. En Android, los componentes que pintan colores llaman a `useTheme()` (que usa `useColorScheme`) para volver a pintarse cuando cambia el modo.
- **Texto grande**: ver [Tipografía](#tipografía). Probar cada pantalla con el tamaño más grande del sistema.
- **Datos copiables**: `selectable` en mensajes de error, direcciones, emails y mensajes del chat.

## Checklist para el PR

- [ ] Ningún hexadecimal, `rgba` ni `fontSize` fuera de `src/theme/`. Ningún `fontWeight` (el peso es la familia).
- [ ] Espaciados, radios y tamaños salen de los tokens; sin `+ 2` ni números sueltos (salvo un ajuste óptico comentado).
- [ ] Usa los componentes base; si repite un bloque en dos pantallas, se propuso como componente.
- [ ] Un solo botón `primary` visible. El lima, como mucho una vez por bloque y siempre como relleno.
- [ ] Los cuatro estados (cargando, vacío, error, con datos), con textos que dicen qué hacer.
- [ ] Microcopy en voseo, frases cortas, verbo concreto en los botones; el mismo nombre para la misma acción en toda la app.
- [ ] Todo lo que se toca: ≥ 48 (o `hitSlop`), rol, nombre, estado y respuesta al apretar.
- [ ] Probado en claro y en oscuro, y con el texto más grande del sistema, en iOS y en Android.
- [ ] Tests con `getByRole` / `getByLabelText` (no por estilos), que además prueban la accesibilidad.
