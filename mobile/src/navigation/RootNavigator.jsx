import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { AUTH_STATUS } from '../contexts/AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'
import HealthScreen, { TEXTS as HEALTH_TEXTS } from '../screens/HealthScreen.jsx'
import LoadingScreen from '../screens/LoadingScreen.jsx'
import LoginScreen, { TEXTS as LOGIN_TEXTS } from '../screens/LoginScreen.jsx'
import OnboardingScreen from '../screens/OnboardingScreen.jsx'
import ProfileScreen from '../screens/ProfileScreen.jsx'
import RegisterScreen, { TEXTS as REGISTER_TEXTS } from '../screens/RegisterScreen.jsx'
import RestoreErrorScreen from '../screens/RestoreErrorScreen.jsx'

export const ROUTES = Object.freeze({
  LOGIN: 'Login',
  REGISTER: 'Register',
  ONBOARDING: 'Onboarding',
  PROFILE: 'Profile',
  HEALTH: 'Health'
})

const Stack = createNativeStackNavigator()

// Dos stacks según la sesión: al iniciar o cerrar sesión se cambia de stack y las pantallas del otro
// dejan de existir (no se puede volver atrás a una pantalla protegida).
function AuthStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.LOGIN}>
      <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} options={{ title: LOGIN_TEXTS.title }} />
      <Stack.Screen name={ROUTES.REGISTER} component={RegisterScreen} options={{ title: REGISTER_TEXTS.title }} />
    </Stack.Navigator>
  )
}

// El feed de planes llega en el sprint 3: mientras tanto el perfil es la pantalla principal.
function AppStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.PROFILE}>
      <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} options={{ title: 'Mi perfil' }} />
      <Stack.Screen name={ROUTES.HEALTH} component={HealthScreen} options={{ title: HEALTH_TEXTS.title }} />
    </Stack.Navigator>
  )
}

// Primer ingreso: el onboarding se muestra hasta que la persona lo termina o lo deja para después ("Más tarde").
function OnboardingStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.ONBOARDING}>
      <Stack.Screen name={ROUTES.ONBOARDING} component={OnboardingScreen} options={{ title: 'Bienvenido a junte', headerBackVisible: false }} />
    </Stack.Navigator>
  )
}

export function RootNavigator () {
  const { status, user } = useAuth()
  if (status === AUTH_STATUS.LOADING) return <LoadingScreen />
  if (status === AUTH_STATUS.RESTORE_ERROR) return <RestoreErrorScreen />
  if (status !== AUTH_STATUS.SIGNED_IN) return <AuthStack />
  return user.onboardingCompleted ? <AppStack /> : <OnboardingStack />
}
