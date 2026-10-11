import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'

import { AuthProvider } from './contexts/AuthContext.jsx'
import { RootNavigator } from './navigation/RootNavigator.jsx'
import { configureApiAuth } from './services/api/client.js'
import { authService } from './services/auth.js'

// El cliente HTTP compartido toma de acá el access token, el refresh y el aviso de sesión terminada.
configureApiAuth(authService.apiAuth)

export default function App () {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style='auto' />
      </NavigationContainer>
    </AuthProvider>
  )
}
