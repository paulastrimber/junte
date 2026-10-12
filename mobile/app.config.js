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

// Identificador de la app en Android (`package`) e iOS (`bundleIdentifier`). Es permanente: no se cambia una vez
// publicada, y la clave de Google Maps se restringe a este paquete + la huella SHA-1 del certificado de firma.
const APP_ID = 'com.junte.app'

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

export default ({ config }) => ({
  ...config,
  name: 'junte',
  slug: 'junte',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: true
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png'
    }
  },
  plugins: [
    'expo-dev-client',
    // Tokens en Keychain / Keystore.
    'expo-secure-store',
    // Foto de perfil: solo se elige de la galería (no se pide acceso a la cámara).
    ['expo-image-picker', { photosPermission: 'junte necesita acceder a tus fotos para que elijas tu foto de perfil.', cameraPermission: false, microphonePermission: false }],
    '@react-native-community/datetimepicker',
    // Feed cercano y lugar de un plan: solo mientras se usa la app (sin ubicación en segundo plano).
    ['expo-location', {
      locationWhenInUsePermission: 'junte usa tu ubicación para mostrarte planes cercanos, marcar el lugar de los planes que creás y confirmar tu asistencia.',
      isAndroidBackgroundLocationEnabled: false
    }],
    // Check-in: la cámara solo se usa para leer el QR de asistencia (sin micrófono ni grabación).
    ['expo-camera', { cameraPermission: 'junte usa la cámara para leer el QR de asistencia de los planes.', microphonePermission: false, recordAudioAndroid: false }],
    // Compatibilidad horaria del feed: solo se lee cuándo estás ocupado, nunca el contenido de los eventos.
    ['expo-calendar', { calendarPermission: 'junte mira cuándo estás ocupado en tu calendario para recomendarte planes en horarios que te queden libres.' }],
    // Mapa para elegir el lugar de un plan. En iOS usa Apple Maps (sin clave).
    ['react-native-maps', { androidGoogleMapsApiKey: readGoogleMapsAndroidKey() }]
  ],
  extra: {
    ...config.extra,
    appEnv: process.env.APP_ENV ?? 'development',
    apiUrl: readApiUrl()
  }
})
