import { NavigationContainer } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'

import { AuthProvider } from './contexts/AuthContext.jsx'
import { RootNavigator } from './navigation/RootNavigator.jsx'
import LoadingScreen from './screens/LoadingScreen.jsx'
import { configureApiAuth } from './services/api/client.js'
import { authService } from './services/auth.js'
import { fontAssets, navigationTheme, useTheme } from './theme/index.js'

// El cliente HTTP compartido toma de acá el access token, el refresh y el aviso de sesión terminada.
configureApiAuth(authService.apiAuth)

export default function App () {
  const { scheme } = useTheme()
  // Si la tipografía no se puede cargar, la app sigue con la fuente del sistema.
  const [areFontsLoaded, fontError] = useFonts(fontAssets)
  const isReady = areFontsLoaded || Boolean(fontError)

  return (
    <AuthProvider>
      <NavigationContainer theme={navigationTheme(scheme)}>
        {/* La sesión se restaura mientras cargan las fuentes: AuthProvider ya está montado. */}
        {isReady ? <RootNavigator /> : <LoadingScreen />}
        <StatusBar style='auto' />
      </NavigationContainer>
    </AuthProvider>
  )
}
