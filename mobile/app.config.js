// Configuración de Expo. Es el ÚNICO lugar que lee EXPO_PUBLIC_API_URL: la expone en
// `extra.apiUrl` y la app la consume desde src/config/ (vía expo-constants).
//
// De dónde sale la variable:
// - `npx expo start` / `expo export`: de mobile/.env (copiar .env.example).
// - EAS Build: del `env` del perfil en eas.json (development / preview / production).
//
// Solo variables EXPO_PUBLIC_* llegan al binario: acá no puede haber nada secreto.

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

export default ({ config }) => ({
  ...config,
  name: 'junte',
  slug: 'junte',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png'
    }
  },
  plugins: ['expo-dev-client'],
  extra: {
    ...config.extra,
    appEnv: process.env.APP_ENV ?? 'development',
    apiUrl: readApiUrl()
  }
})
