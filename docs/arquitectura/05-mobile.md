# 05 · App móvil (capa 1 · Cliente)

React Native con Expo + EAS Build. **Nunca accede a MongoDB ni recibe credenciales de AWS**: solo habla con `/api/v1` y con S3 mediante URLs firmadas.

## MVC en la app

| Rol | Pieza | Hace | Nunca hace |
|-----|-------|------|-----------|
| **View** | `screens/`, `components/` | Renderizan y emiten eventos | `fetch`/`axios`, leer tokens, lógica de negocio |
| **Controller** | `hooks/` (`usePlanDetail`, `usePlanActions`, `usePlanQr`, `useCheckIn`, `useMyPlans`, `useFeed`…) | Orquestan: llaman services (también los del dispositivo: cámara, ubicación, calendario), manejan loading/error, devuelven estado listo para pintar | Renderizar |
| **Model** | `services/` + `contexts/` | Cliente HTTP, Socket.io, auth/tokens, FCM, ubicación, persistencia offline; estado global mínimo | Conocer pantallas |

Regla de oro: **una screen nunca llama a la API directamente**; siempre a través de un hook. Tampoco importa services del dispositivo (cámara, ubicación): el hook expone el dato ya resuelto (p. ej. `useFeed().locationNotice`, `useCameraPermission()`).

```
screens ──▶ hooks ──▶ services ──▶ API
   │          │
components  contexts (AuthContext, …)
```

## Estructura

```
mobile/
  app.config.js            # lee EXPO_PUBLIC_* por perfil de EAS
  eas.json                 # perfiles development / preview / production
  src/
    screens/               # LoginScreen, RegisterScreen, OnboardingScreen (3 pasos), HomeScreen (feed), PlanScreen,
                           # CreatePlanScreen, PlanQrScreen (QR del creador), CheckInScreen, MyPlansScreen, ChatScreen, ProfileScreen
    components/            # PlanCard, Button, Avatar, EmptyState, ErrorBanner… (presentacionales)
    hooks/
    services/
      api/client.js        # axios: baseURL, token, refresh, mapeo de errores
      api/plans.js …       # una función por endpoint
      auth.js              # sesión: login, registro, restore, refresh, logout (usa tokenStorage)
      tokenStorage.js      # access/refresh en expo-secure-store (+ copia en memoria)
      photoUpload.js       # presign → PUT directo a S3 → confirmar
      imagePicker.js       # expo-image-picker (solo imágenes, recorte cuadrado)
      api/catalogs.js      # GET /catalogs (intereses por categoría, universidades con carreras, ciudades con barrios)
      api/plans.js         # GET/POST /plans, GET/PATCH /plans/:id, GET /plans/filters
      api/feed.js          # POST /feed (cercanía + recomendación)
      calendar.js          # expo-calendar: franjas ocupadas (solo inicio y fin) para el feed
      socket.js            # socket.io-client: una conexión para toda la app, salas, ack con timeout y estado de la conexión
      push.js              # permisos + registro del token en POST /devices
      location.js          # expo-location: permiso, posición actual [lng, lat], posición precisa para el check-in y búsqueda de direcciones
      camera.js            # expo-camera: permiso para leer el QR de asistencia
      offline/             # caché de lecturas y cola de pendientes
    contexts/              # AuthContext (sesión), estado mínimo compartido
    navigation/            # stacks y tabs (React Navigation); routes.js tiene los nombres de las rutas
    config/                # URLs por entorno (sin secretos)
    utils/                 # funciones puras (formatos de fecha, distancia…)
  tests/
```

## Cliente HTTP (`services/api/client.js`)

- `baseURL` = `EXPO_PUBLIC_API_URL` del perfil de EAS.
- Interceptor de request: agrega `Authorization: Bearer <access>` (salvo en las requests con `skipAuth: true`: register, login y refresh).
- Interceptor de response ante 401 `TOKEN_EXPIRED`/`UNAUTHENTICATED`: **un solo refresh en vuelo** (las demás requests esperan esa promesa), reintenta una vez cada request. Una request lenta que falla después de que otra ya renovó el token solo se reintenta (no hace otro refresh). Si el refresh es rechazado (401) → se avisa a `AuthContext` y se vuelve al login; si falla por red, la sesión se conserva. `ACCOUNT_SUSPENDED` cierra la sesión sin intentar el refresh.
- La sesión (token en memoria, refresh, aviso de sesión terminada) se registra con `configureApiAuth(authService.apiAuth)` al arrancar `App`.
- Todo error se convierte en `ApiError { status, code, message, requestId }`.

## Errores en la UI (hooks → screens)

- **Todo hook expone sus errores como `ViewError`**: `{ code, message, requestId }` (en `useCheckIn`, más `canRetry`). Se arma con una sola función, `toViewError(error, overrides?)` de `utils/errorMessages.js`, que elige el texto por `code` (los textos propios de una acción, como los del chat o los de inscribirse, van como `overrides` en el hook) y usa el `message` del servidor cuando el `code` no tiene uno propio. Nunca un `string` suelto: se perdería el `requestId`.
- **Una screen nunca elige textos de error** (no llama a `messageForError`): pasa el `ViewError` a `ErrorState` (la pantalla o el bloque no cargó), a `ErrorBanner` (falló una acción, un formulario, un refresco o "cargar más") o lo pinta tal cual.
- `ErrorBanner` y `ErrorState` muestran el `requestId` solo en desarrollo (`__DEV__`). Excepción: la pantalla "Estado del servidor" muestra `code` y `requestId` siempre (es su propósito).
- Los errores por campo siguen como `errors: Record<campo, string>` (de `fieldErrorsFrom`); el general del formulario es `formError: ViewError | null`. `CAPACITY_BELOW_PARTICIPANTS` se muestra en el campo del cupo con el texto del servidor.
- Un error que se ignora a propósito (las estadísticas del perfil) se comenta y se loguea solo en desarrollo, con `code` y `requestId`.

## Onboarding y selectores

- La navegación tiene tres stacks según la sesión: acceso (login/registro), **onboarding** (sesión iniciada con `onboardingCompleted: false`) y app.
- Onboarding de 3 pasos, **todo salteable** ("Saltar este paso", "Más tarde"): 1 fecha de nacimiento y foto, 2 universidad, carrera, ciudad y barrio, 3 intereses por categoría. Cada "Siguiente" guarda ese paso (`PUT /users/me`); terminar o salir marca `onboardingCompleted` y no vuelve a aparecer.
- `SelectField` (lista con buscador y "Otra" al final) e `InterestPicker` (chips por categoría) son presentacionales; `useCatalogs` pide `GET /catalogs` una vez por sesión de la app y `useProfileDraft` (compartido por el onboarding y el Perfil) calcula opciones y cambios. La carrera depende de la universidad y el barrio de la ciudad; las opciones con edad mínima no se muestran a menores ni sin fecha de nacimiento.

## Navegación y pantallas de planes (S3)

- Con sesión y onboarding hecho, la app son **cuatro tabs inferiores**, cada uno con su stack: **Planes** (feed → detalle → editar), **Mis planes** (mis planes → detalle), **Crear** y **Perfil** (perfil → estado del servidor). Las pantallas que se usan poco y arrastran módulos pesados (crear/editar con el mapa, QR, check-in con la cámara, estado del servidor) se cargan al abrirlas (`getComponent`); sus títulos viven en `navigation/titles.js`. `metro.config.js` activa `inlineRequires`: cada módulo se evalúa en su primer uso.
- **HomeScreen (feed)**: `FlatList` con scroll infinito por `nextCursor`, pull-to-refresh y los cuatro estados. `useFeed` pide la ubicación; si la hay, lee las franjas ocupadas del calendario (si hay permiso) y consulta `POST /feed`; sin ubicación degrada a `GET /plans` (por fecha) y lo explica (`locationNotice`). Las páginas siguientes repiten exactamente la misma consulta con el cursor.
- **Errores de una lista** (`useFeed`, `usePagedList`): `error` si falló la primera carga (pantalla de error con los filtros arriba), `refreshError` si falló un pull-to-refresh (se conservan los planes y se avisa arriba, con "Reintentar") y `loadMoreError` si falló una página siguiente (aviso al pie).
- **Secciones "Con cupo" / "Llenos"**: el feed principal trae planes con lugar; los llenos van aparte (`availability=full`), se pueden abrir pero no admiten inscripción.
- **Filtros** (`FeedFilters` + `useFeedFilters`): distancia máxima (0.5, 1, 2, 5, 10, 25 o 50 km; por defecto 10), fecha (hoy, 7 días, 30 días), costo (uno o varios rangos, que la app lee de `GET /plans/filters`) y tipo de actividad (intereses del catálogo). Son predefinidos: nunca se escribe una consulta. Se aplican solos, sin botón: la consulta sale cuando pasan 400 ms sin cambios (`FILTERS_DEBOUNCE_MS`; cambiar "Con cupo" / "Llenos" va enseguida), cancela la anterior y los planes que se veían quedan en pantalla hasta que llega la respuesta (`isReloading`). Mientras se tocan, `useFeed` reutiliza la ubicación y las franjas del calendario de la última consulta (hasta 60 s), así cada toque no vuelve a pedir el GPS ni a leer el calendario. El pull-to-refresh y "Reintentar" las piden de nuevo.
- **PlanScreen**: detalle con horario de inicio y fin, lugar, costo, cupo ("Sin límite de cupo" si es ilimitado), inscriptos y quién organiza. El creador ve "Editar plan". La orquesta `usePlanDetail` (plan, acciones, anotados, refrescos y confirmaciones): "Cancelar plan" y "Darme de baja" piden confirmación antes de mandarse (cancelar no se deshace; el lugar liberado lo puede ocupar otra persona).
- **Volver a una pantalla**: `useRefreshOnFocus(navigation, refresh)` (en `hooks/useScreenFocus.js`) vuelve a pedir los datos en cada `focus` **salvo el primero**, que React Navigation emite al montar (si no, cada entrada pedía todo dos veces). Lo usan el detalle del plan y Mis planes. `useScreenFocus(navigation)` dice si la pantalla está en primer plano (el chat hace polling solo entonces). El detalle también se refresca cuando la app vuelve de segundo plano (`background` → `active`, no un `inactive`), solo si está a la vista, y entonces pide el plan y los anotados sin pasar por "cargando". Si un refresco del detalle falla, el plan sigue a la vista con un aviso (`refreshError`).
- **CreatePlanScreen** (crear y editar): `LocationPicker` (buscador de dirección + "Usar mi ubicación" + mapa de `react-native-maps` con un pin arrastrable), nombre del lugar, fecha y hora de inicio y de fin (`DateTimeField`), interruptor "Cupo ilimitado", costo e intereses. Al editar manda solo lo que cambió. Con el perfil incompleto, en lugar del formulario explica qué falta.
- El mapa en Android necesita la clave de Google Maps (`GOOGLE_MAPS_ANDROID_API_KEY`), la única excepción a "nada secreto en el binario": ver [09-seguridad.md](09-seguridad.md#secretos). Requiere un **development build** (no funciona en Expo Go).

## Tokens y datos sensibles

- Access y refresh token en `expo-secure-store` (Keychain / Keystore). **Nunca** en `AsyncStorage` ni en logs.
- La ubicación exacta solo se manda en el check-in y en el feed (`near`); no se guarda en el dispositivo más de lo necesario.

## Tiempo real y push

- `socket.io-client` con `path: '/api/v1/socket.io'`, `transports: ['websocket']` y `auth` como función (se evalúa en cada intento, así cada reconexión lleva el token vigente). Una sola conexión para toda la app (`services/socket.js`): se abre al entrar al primer chat y se cierra al salir del último, al cerrar sesión o al vencerse (`authService.onSessionEnded`).
- Un `connect_error` con `TOKEN_EXPIRED`/`UNAUTHENTICATED` renueva la sesión **una vez** con el mismo refresh único que usa el cliente HTTP (`authService.refreshSession` es *single-flight*: el refresh token rota y dos canjes a la vez cerrarían la sesión) y reconecta; `ACCOUNT_SUSPENDED` o un segundo rechazo terminan la sesión.
- Al (re)conectar vuelve a hacer `chat:join` de las salas abiertas y `useChat` pide la primera página por REST y la fusiona por `id`/`clientId`.
- `useChat` muestra el mensaje propio como pendiente, lo manda por `chat:send` y, si no hay conexión o el ack no llega en 8 s, por `POST /plans/:id/messages` con el mismo `clientId` (el back no lo duplica). Un error del servidor (permiso, validación) lo deja "No se envió · Reintentar".
- Con la app en segundo plano el socket se corta (sin olvidar las salas) y se reconecta al volver a primer plano; al conectar se vuelven a hacer los `chat:join` y `useChat` recupera la primera página. Un `inactive` (centro de control, diálogos) no corta nada.
- Si el WebSocket falla 3 veces seguidas, `useChat` pasa a polling de `GET /plans/:id/messages` cada 5 s mientras la pantalla está activa, y lo avisa en un banner.
- Push: como el back envía directo por FCM, el token se obtiene con `getDevicePushTokenAsync()` (token nativo FCM), **no** con el token de Expo Push. Se registra en `POST /devices` y se borra con `DELETE /devices/:token` al cerrar sesión.
- Push solo se prueba en un **development build** (Expo Go no lo soporta).
- **Implementado en S5** (`services/push.js` + `hooks/usePlanLinks.js`): con la sesión iniciada (al montar los tabs) se pide el permiso una vez, se crea el canal `default` de Android, se registra el token y se vuelve a registrar si FCM lo rota. Al cerrar sesión (`logout` o `logout-all`) `authService.onBeforeLogout` da de baja el token antes de borrar la sesión local (el access token sigue valiendo esos segundos). Sin permiso, en Expo Go o sin Firebase configurado, no pasa nada (la app sigue sin avisos).
- Cada aviso trae `data: { type, planId }` (`plan.joined`, `plan.spot_freed`, `plan.reminder`): al tocarlo se abre el detalle del plan en el tab "Planes" (`navigation/navigationRef.js`), también si fue lo que abrió la app (se atiende cuando ya hay sesión). Con la app abierta se muestra el banner (sin sonido).
- **Firebase (`google-services.json`)**: no se versiona. En local va en `mobile/google-services.json` (ignorado por Git); en EAS se carga como variable de entorno **de tipo archivo** `GOOGLE_SERVICES_JSON` (`eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment development` y lo mismo para `preview`/`production`). `app.config.js` toma primero la variable y si no, el archivo local; sin ninguno compila igual, sin push.
- **Enlaces para invitar** (S5-MOB-05): "Invitar a alguien" en el detalle comparte (hoja nativa de compartir) el título, cuándo, dónde y `junte://plans/<id>`; el enlace abre la app en ese plan (`scheme: 'junte'`). No se leen ni se suben contactos.
- **Notas de voz** (S5-MOB-05): con el campo vacío, el botón del chat graba (`expo-audio`, AAC `.m4a` mono 64 kbps, hasta 60 s, se corta solo). Al enviar: `POST /uploads/presign` con `audio/mp4` y el `planId`, `PUT` a S3 y `chat:send` (o REST) con `type: 'voice'`, `audioKey` y `durationMs`. No pasan por la cola offline: sin conexión quedan "No se envió · Reintentar" (el archivo sigue en el teléfono; si ya se subió, el reintento solo manda el mensaje).

## Permisos del dispositivo

Pedirlos **en el momento en que se usan**, explicando para qué, y degradar con elegancia si se niegan:

| Permiso | Cuándo | Si se niega |
|---------|--------|-------------|
| Ubicación | Feed cercano, "usar mi ubicación" al crear un plan, check-in | Feed por fecha (sin `near`), con un aviso; al crear se busca una dirección o se toca el mapa; check-in imposible (se explica) |
| Cámara | Escanear QR | No hay check-in |
| Calendario | Compatibilidad horaria del feed (solo lectura: próximos 30 días, hasta 200 franjas, sin eventos de día completo) | No se manda nada: `H = 0.5` (neutral), salvo los planes en los que ya está inscripto, que el back conoce |
| Notificaciones | Después del login | Sin push; todo sigue funcionando |
| Micrófono | Al tocar "Grabar una nota de voz" en el chat (S5) | Aviso en el chat; se sigue pudiendo escribir |
| Contactos | No se piden: invitar es compartir un enlace con la hoja nativa (S5) | — |

## Offline

- Lecturas (feed, detalle, mis planes, historial de chat) se cachean y se muestran marcadas como "sin conexión".
- Escrituras **no se confirman en la UI hasta que el servidor las acepta** (requisito del informe). Se muestran como "pendiente" y se reintentan al volver la conexión; si el servidor responde 409 (cupo agotado, etc.) se informa al usuario.
- No se encolan operaciones que dependen del momento exacto (check-in).

**Implementación (S6, `services/offline/`):**

- **Dependencias:** `@react-native-async-storage/async-storage` (lo guardado) y `@react-native-community/netinfo` (si hay red). Las dos funcionan en Expo Go y en el APK. Nada secreto va a AsyncStorage: los tokens siguen en `expo-secure-store`.
- **Conexión (`connectivity`):** "sin conexión" solo cuando NetInfo lo sabe; mientras no se sabe, se intenta y una falla por red (`NETWORK_ERROR`/`TIMEOUT`) cuenta igual.
- **Caché de lecturas (`readCache` + `readThrough`):** la primera página del feed (por filtros y radio; no la posición ni el calendario), el detalle de un plan, "Mis planes", la primera página del chat, los catálogos y el propio perfil (`me`, para poder abrir la app sin red). Se guarda la última respuesta del servidor con la hora (`savedAt`); sin conexión se muestra con `OfflineNotice` ("Sin conexión. Te mostramos lo último que guardamos (14:05)") y sin "cargar más". Límites: 30 planes, 20 chats, 5 feeds, 4 listas de "Mis planes" (se borran los más viejos). Un refresco que falla conserva lo que ya se veía.
- **Cola de pendientes (`outbox`):** inscribirse, darse de baja, mensajes del chat y reportes (decidido en S6). Se guarda en el teléfono, se manda en orden, de a uno, cuando vuelve la red o la app vuelve a primer plano (nunca con un timer ni en segundo plano), y solo con la sesión iniciada. Una falla de red la deja pendiente y corta la vuelta; un rechazo del servidor la deja "no se pudo enviar" con el motivo (p. ej. `PLAN_FULL`) hasta que la persona la descarta o la reintenta. Inscribirse y darse de baja del mismo plan sin conexión se anulan. Un mensaje encolado conserva su `clientId`, así que reintentarlo nunca lo duplica; `ALREADY_JOINED` al reintentar una inscripción cuenta como hecha. La pantalla "Pendientes" lista todo.
- **Al cerrar sesión** (o vencerse) se borran la caché y la cola: son de esa cuenta.

## Permisos y batería (S6-MOB-04)

- Ubicación solo con la app abierta y en el momento de usarla (feed, crear plan, check-in): `requestForegroundPermissionsAsync`, `isAndroidBackgroundLocationEnabled: false` y `ACCESS_BACKGROUND_LOCATION` bloqueado en el manifiesto de Android.
- En segundo plano no hay polling ni WebSocket del chat (se suelta la conexión y se recupera al volver), el refresco automático del detalle no consulta al servidor y la cola de pendientes no se manda.

## UI

- Layout con Flexbox (`flexDirection`, `justifyContent`, `alignItems`, `gap`), estilos con `StyleSheet.create`.
- Listas largas con `FlatList` (nunca `map` dentro de un `ScrollView` para el feed o el chat).
- Componentes de lista con `React.memo` y `keyExtractor` estable.
- Toda pantalla contempla cuatro estados: **cargando, vacío, error, con datos**, siempre con los mismos componentes: `LoadingState` / `PlanCardSkeleton`, `EmptyState`, `ErrorState` (o `ErrorBanner` para una acción o un refresco) y `Notice` para avisos que no son errores.
- Colores, tipografía, espaciado, componentes base y reglas de accesibilidad: [diseno-ui.md](../practicas/diseno-ui.md).

## Entornos (EAS)

| Perfil | Uso | API |
|--------|-----|-----|
| `development` | Development build, push, debug | Local (docker-compose) o dev |
| `preview` | APK de pruebas internas | Entorno de pruebas |
| `production` | APK de entrega (`android.buildType: 'apk'`); cambiar a AAB para tiendas | Producción |

Solo variables `EXPO_PUBLIC_*` llegan al binario: **nada secreto** puede ir ahí.
