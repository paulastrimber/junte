// Configuración de Expo. Es el ÚNICO lugar que lee EXPO_PUBLIC_API_URL: la expone en
// `extra.apiUrl` y la app la consume desde src/config/ (vía expo-constants).
//
// De dónde sale la variable:
// - `npx expo start` / `expo export`: de mobile/.env (copiar .env.example).
// - EAS Build: del `env` del perfil en eas.json (development / preview / production).
//
// Solo variables EXPO_PUBLIC_* llegan al binario: acá no puede haber nada secreto.
//
// Única excepción (documentada en docs/arquitectura/09-seguridad.md): GOOGLE_MAPS_ANDROID_API_KEY, la clave del SDK de
// Google Maps para Android que usa el mapa de "crear plan". Queda dentro del APK por diseño de Google; por eso tiene
// que estar RESTRINGIDA en Google Cloud a esta app (nombre de paquete + huella SHA-1) y a "Maps SDK for Android".
// No se commitea: sale de mobile/.env en local y de las variables de entorno de EAS en los builds.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { loadProjectEnv } from '@expo/env'

// `expo export` lee esta configuración ANTES de cargar mobile/.env (lo carga recién al empaquetar; `expo start` sí lo
// carga primero), así que sin esto falla con "Falta EXPO_PUBLIC_API_URL" aunque el .env la tenga. Es la misma carga
// que hace Expo CLI: no pisa variables ya definidas (EAS, terminal) y respeta EXPO_NO_DOTENV.
loadProjectEnv(fileURLToPath(new URL('.', import.meta.url)), { mode: process.env.NODE_ENV, silent: true })

// Identificador de la app en Android (`package`) e iOS (`bundleIdentifier`). Es permanente: no se cambia una vez
// publicada, y la clave de Google Maps se restringe a este paquete + la huella SHA-1 del certificado de firma.
const APP_ID = 'com.junte.app'

// Proyecto de EAS. Por defecto el del equipo (@man1111s-team/junte; el projectId no es secreto). Para compilar en otra
// cuenta de Expo sin editar este archivo: EAS_OWNER=<cuenta> en mobile/.env o en la terminal, `npx eas-cli init` y
// EAS_PROJECT_ID=<id que muestra>. Con EAS_OWNER propio no se usa el projectId del equipo (EAS lo rechazaría).
const DEFAULT_EAS_OWNER = 'man1111s-team'
const DEFAULT_EAS_PROJECT_ID = 'fce23ad9-8c35-4b99-8399-5e390e72218b'
const EAS_OWNER = process.env.EAS_OWNER?.trim() || DEFAULT_EAS_OWNER
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID?.trim() ||
  (EAS_OWNER === DEFAULT_EAS_OWNER ? DEFAULT_EAS_PROJECT_ID : undefined)

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
// Dominio reservado (RFC 2606) usado como marcador en eas.json hasta que exista el DNS real.
const PLACEHOLDER_TLD = '.invalid'

function readApiUrl () {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (!raw) {
    throw new Error(
      'Falta EXPO_PUBLIC_API_URL. En local: copiá mobile/.env.example a mobile/.env. ' +
      'En EAS: definila en el "env" del perfil de eas.json.'
    )
  }

  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`EXPO_PUBLIC_API_URL no es una URL válida: "${raw}"`)
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`EXPO_PUBLIC_API_URL debe ser http(s), no "${url.protocol}"`)
  }
  // Evita generar un APK que apunta a un dominio que no existe.
  if (process.env.EAS_BUILD === 'true' && url.hostname.endsWith(PLACEHOLDER_TLD)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL usa el marcador "${url.hostname}". ` +
      'Reemplazalo en eas.json por el dominio real del entorno antes de compilar.'
    )
  }

  // Sin barra final: los services arman rutas como '/health'.
  return raw.replace(/\/+$/, '')
}

function readGoogleMapsAndroidKey () {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim()
  // En local se puede trabajar sin la clave (el mapa de Android se ve vacío); un build de EAS sin ella saldría roto.
  if (!key && process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM !== 'ios') {
    throw new Error(
      'Falta GOOGLE_MAPS_ANDROID_API_KEY. Definila como variable de entorno de EAS (clave restringida a la app; ' +
      'ver docs/arquitectura/09-seguridad.md).'
    )
  }
  return key || undefined
}

// Avisos push (S5-MOB-04): config de Firebase de la app de Android. No se versiona (.gitignore). En EAS se sube como
// variable de entorno de tipo archivo GOOGLE_SERVICES_JSON (EAS la reemplaza por la ruta del archivo); en local, se
// baja a mobile/google-services.json. Sin ella la app compila igual, pero no recibe avisos push.
function readGoogleServicesFile () {
  const fromEas = process.env.GOOGLE_SERVICES_JSON?.trim()
  if (fromEas) return fromEas
  const local = fileURLToPath(new URL('./google-services.json', import.meta.url))
  return existsSync(local) ? './google-services.json' : undefined
}

export default ({ config }) => ({
  ...config,
  name: 'junte',
  slug: 'junte',
  owner: EAS_OWNER,
  version: '0.1.0',
  orientation: 'portrait',
  // Enlaces para invitar a un plan: junte://plans/<id> abre el detalle (S5-MOB-05).
  scheme: 'junte',
  icon: './assets/icon.png',
  // Modo claro u oscuro según el sistema; los colores de cada modo están en src/theme/colors.js.
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: true
  },
  android: {
    package: APP_ID,
    googleServicesFile: readGoogleServicesFile(),
    // La ubicación solo se usa con la app abierta (S6-MOB-04): aunque alguna librería la declare, el permiso de
    // ubicación en segundo plano no entra al manifiesto.
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1E1033'
    }
  },
  plugins: [
    'expo-dev-client',
    // Pantalla de carga: el logo centrado sobre el fondo de marca.
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#1E1033', imageWidth: 200 }],
    // Tokens en Keychain / Keystore.
    'expo-secure-store',
    // Fotos de perfil con caché en disco (la URL firmada cambia; la caché va por la ruta sin firma).
    'expo-image',
    // Foto de perfil: solo se elige de la galería (no se pide acceso a la cámara).
    ['expo-image-picker', { photosPermission: 'junte necesita acceder a tus fotos para que elijas tu foto de perfil.', cameraPermission: false, microphonePermission: false }],
    '@react-native-community/datetimepicker',
    // Feed cercano y lugar de un plan: solo mientras se usa la app (sin ubicación en segundo plano).
    ['expo-location', {
      locationWhenInUsePermission: 'junte usa tu ubicación para mostrarte planes cercanos, marcar el lugar de los planes que creás y confirmar tu asistencia.',
      isAndroidBackgroundLocationEnabled: false
    }],
    // Check-in: la cámara solo se usa para leer el QR de asistencia (sin micrófono ni grabación).
    // (El micrófono lo pide expo-audio, para las notas de voz: la cámara nunca graba.)
    ['expo-camera', { cameraPermission: 'junte usa la cámara para leer el QR de asistencia de los planes.', recordAudioAndroid: false }],
    // Notas de voz del chat (S5-MOB-05): solo se graba mientras la persona mantiene la grabación abierta en el chat.
    ['expo-audio', { microphonePermission: 'junte usa el micrófono para grabar las notas de voz que mandás en el chat de un plan.', enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    // Avisos push (FCM): nuevo inscripto, lugar liberado y recordatorio.
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#8BD33F', defaultChannel: 'default' }],
    // Compatibilidad horaria del feed: solo se lee cuándo estás ocupado, nunca el contenido de los eventos.
    ['expo-calendar', { calendarPermission: 'junte mira cuándo estás ocupado en tu calendario para recomendarte planes en horarios que te queden libres.' }],
    // Mapa para elegir el lugar de un plan. En iOS usa Apple Maps (sin clave).
    ['react-native-maps', { androidGoogleMapsApiKey: readGoogleMapsAndroidKey() }],
    // Builds release: el prebuild de SDK 58 activa R8 (minify). react-native-maps trae WorkManager, que arranca solo al
    // abrir la app y usa una base de Room; Room crea su implementación generada (WorkDatabase_Impl) por reflexión y R8
    // la dejaba sin constructor: el APK se cerraba al abrir. Ver docs/pendientes.md (sección J).
    ['expo-build-properties', {
      android: {
        extraProguardRules: [
          '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
          '-keep class * extends androidx.work.ListenableWorker { public <init>(android.content.Context, androidx.work.WorkerParameters); }',
          '-keep class * extends androidx.work.InputMerger { public <init>(); }'
        ].join('\n')
      }
    }]
  ],
  extra: {
    ...config.extra,
    ...(EAS_PROJECT_ID && { eas: { ...config.extra?.eas, projectId: EAS_PROJECT_ID } }),
    appEnv: process.env.APP_ENV ?? 'development',
    apiUrl: readApiUrl()
  }
})
