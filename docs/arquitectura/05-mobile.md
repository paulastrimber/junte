# 05 · App móvil (capa 1 · Cliente)

React Native con Expo + EAS Build. **Nunca accede a MongoDB ni recibe credenciales de AWS**: solo habla con `/api/v1` y con S3 mediante URLs firmadas.

## MVC en la app

| Rol | Pieza | Hace | Nunca hace |
|-----|-------|------|-----------|
| **View** | `screens/`, `components/` | Renderizan y emiten eventos | `fetch`/`axios`, leer tokens, lógica de negocio |
| **Controller** | `hooks/` (`usePlans`, `useJoinPlan`, `useCheckIn`) | Orquestan: llaman services, manejan loading/error, devuelven estado listo para pintar | Renderizar |
| **Model** | `services/` + `contexts/` | Cliente HTTP, Socket.io, auth/tokens, FCM, ubicación, persistencia offline; estado global mínimo | Conocer pantallas |

Regla de oro: **una screen nunca llama a la API directamente**; siempre a través de un hook.

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
                           # CreatePlanScreen, CheckInScreen, ChatScreen, ProfileScreen
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
      socket.js            # socket.io-client
      push.js              # permisos + registro del token en POST /devices
      location.js          # expo-location: permiso, posición actual [lng, lat] y búsqueda de direcciones (geocodificador del teléfono)
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
- Todo error se convierte en `ApiError { status, code, message, requestId }`. Las pantallas muestran `message` y, en desarrollo, el `requestId` para rastrear en logs.

## Onboarding y selectores

- La navegación tiene tres stacks según la sesión: acceso (login/registro), **onboarding** (sesión iniciada con `onboardingCompleted: false`) y app.
- Onboarding de 3 pasos, **todo salteable** ("Saltar este paso", "Más tarde"): 1 fecha de nacimiento y foto, 2 universidad, carrera, ciudad y barrio, 3 intereses por categoría. Cada "Siguiente" guarda ese paso (`PUT /users/me`); terminar o salir marca `onboardingCompleted` y no vuelve a aparecer.
- `SelectField` (lista con buscador y "Otra" al final) e `InterestPicker` (chips por categoría) son presentacionales; `useCatalogs` pide `GET /catalogs` una vez por sesión de la app y `useProfileDraft` (compartido por el onboarding y el Perfil) calcula opciones y cambios. La carrera depende de la universidad y el barrio de la ciudad; las opciones con edad mínima no se muestran a menores ni sin fecha de nacimiento.

## Navegación y pantallas de planes (S3)

- Con sesión y onboarding hecho, la app son **tres tabs inferiores**, cada uno con su stack: **Planes** (feed → detalle → editar), **Crear** y **Perfil** (perfil → estado del servidor).
- **HomeScreen (feed)**: `FlatList` con scroll infinito por `nextCursor`, pull-to-refresh y los cuatro estados. `useFeed` pide la ubicación; si la hay, lee las franjas ocupadas del calendario (si hay permiso) y consulta `POST /feed`; sin ubicación degrada a `GET /plans` (por fecha) y lo explica. Las páginas siguientes repiten exactamente la misma consulta con el cursor.
- **Secciones "Con cupo" / "Llenos"**: el feed principal trae planes con lugar; los llenos van aparte (`availability=full`), se pueden abrir pero no admiten inscripción.
- **Filtros** (`FeedFilters` + `useFeedFilters`): distancia máxima (0.5, 1, 2, 5, 10, 25 o 50 km; por defecto 10), fecha (hoy, 7 días, 30 días), costo (uno o varios rangos, que la app lee de `GET /plans/filters`) y tipo de actividad (intereses del catálogo). Son predefinidos: nunca se escribe una consulta.
- **PlanScreen**: detalle con horario de inicio y fin, lugar, costo, cupo ("Sin límite de cupo" si es ilimitado), inscriptos y quién organiza. El creador ve "Editar plan".
- **CreatePlanScreen** (crear y editar): `LocationPicker` (buscador de dirección + "Usar mi ubicación" + mapa de `react-native-maps` con un pin arrastrable), nombre del lugar, fecha y hora de inicio y de fin (`DateTimeField`), interruptor "Cupo ilimitado", costo e intereses. Al editar manda solo lo que cambió. Con el perfil incompleto, en lugar del formulario explica qué falta.
- El mapa en Android necesita la clave de Google Maps (`GOOGLE_MAPS_ANDROID_API_KEY`), la única excepción a "nada secreto en el binario": ver [09-seguridad.md](09-seguridad.md#secretos). Requiere un **development build** (no funciona en Expo Go).

## Tokens y datos sensibles

- Access y refresh token en `expo-secure-store` (Keychain / Keystore). **Nunca** en `AsyncStorage` ni en logs.
- La ubicación exacta solo se manda en el check-in y en el feed (`near`); no se guarda en el dispositivo más de lo necesario.

## Tiempo real y push

- `socket.io-client` con `path: '/api/v1/socket.io'`, `transports: ['websocket']` y `auth: { token }`. Al reconectar, se pide el historial por REST desde el último mensaje conocido.
- Si el WebSocket no se puede sostener, se pasa a polling de `GET /plans/:id/messages`.
- Push: como el back envía directo por FCM, el token se obtiene con `getDevicePushTokenAsync()` (token nativo FCM), **no** con el token de Expo Push. Se registra en `POST /devices` y se borra con `DELETE /devices/:token` al cerrar sesión.
- Push solo se prueba en un **development build** (Expo Go no lo soporta).

## Permisos del dispositivo

Pedirlos **en el momento en que se usan**, explicando para qué, y degradar con elegancia si se niegan:

| Permiso | Cuándo | Si se niega |
|---------|--------|-------------|
| Ubicación | Feed cercano, "usar mi ubicación" al crear un plan, check-in | Feed por fecha (sin `near`), con un aviso; al crear se busca una dirección o se toca el mapa; check-in imposible (se explica) |
| Cámara | Escanear QR | No hay check-in |
| Calendario | Compatibilidad horaria del feed (solo lectura: próximos 30 días, hasta 200 franjas, sin eventos de día completo) | No se manda nada: `H = 0.5` (neutral), salvo los planes en los que ya está inscripto, que el back conoce |
| Notificaciones | Después del login | Sin push; todo sigue funcionando |
| Micrófono / contactos | Notas de voz / invitar (sprint 5) | Funcionalidad oculta |

## Offline

- Lecturas (feed, detalle, mis planes, historial de chat) se cachean y se muestran marcadas como "sin conexión".
- Escrituras **no se confirman en la UI hasta que el servidor las acepta** (requisito del informe). Se muestran como "pendiente" y se reintentan al volver la conexión; si el servidor responde 409 (cupo agotado, etc.) se informa al usuario.
- No se encolan operaciones que dependen del momento exacto (check-in).

## UI

- Layout con Flexbox (`flexDirection`, `justifyContent`, `alignItems`, `gap`), estilos con `StyleSheet.create`.
- Listas largas con `FlatList` (nunca `map` dentro de un `ScrollView` para el feed o el chat).
- Componentes de lista con `React.memo` y `keyExtractor` estable.
- Toda pantalla contempla cuatro estados: **cargando, vacío, error, con datos**.

## Entornos (EAS)

| Perfil | Uso | API |
|--------|-----|-----|
| `development` | Development build, push, debug | Local (docker-compose) o dev |
| `preview` | APK de pruebas internas | Entorno de pruebas |
| `production` | APK de entrega (`android.buildType: 'apk'`); cambiar a AAB para tiendas | Producción |

Solo variables `EXPO_PUBLIC_*` llegan al binario: **nada secreto** puede ir ahí.
