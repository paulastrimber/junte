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
    screens/               # LoginScreen, RegisterScreen, HomeScreen (feed), PlanScreen,
                           # CreatePlanScreen, CheckInScreen, ChatScreen, ProfileScreen
    components/            # PlanCard, Button, Avatar, EmptyState, ErrorBanner… (presentacionales)
    hooks/
    services/
      api/client.js        # axios: baseURL, token, refresh, mapeo de errores
      api/plans.js …       # una función por endpoint
      auth.js              # login/logout, tokens en expo-secure-store
      socket.js            # socket.io-client
      push.js              # permisos + registro del token en POST /devices
      location.js          # expo-location
      offline/             # caché de lecturas y cola de pendientes
    contexts/              # AuthContext (sesión), estado mínimo compartido
    navigation/            # stacks y tabs (React Navigation)
    config/                # URLs por entorno (sin secretos)
    utils/                 # funciones puras (formatos de fecha, distancia…)
  tests/
```

## Cliente HTTP (`services/api/client.js`)

- `baseURL` = `EXPO_PUBLIC_API_URL` del perfil de EAS.
- Interceptor de request: agrega `Authorization: Bearer <access>`.
- Interceptor de response ante 401: **un solo refresh en vuelo** (las demás requests esperan esa promesa), reintenta una vez; si el refresh falla → logout.
- Todo error se convierte en `ApiError { status, code, message, requestId }`. Las pantallas muestran `message` y, en desarrollo, el `requestId` para rastrear en logs.

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
| Ubicación | Feed cercano, check-in | Feed sin `near`; check-in imposible (se explica) |
| Cámara | Escanear QR | No hay check-in |
| Calendario | Compatibilidad horaria del feed | `H = 0.5` (neutral) |
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
