import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { AUTH_STATUS } from '../contexts/AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'
import CheckInScreen, { TEXTS as CHECK_IN_TEXTS } from '../screens/CheckInScreen.jsx'
import CreatePlanScreen, { TEXTS as CREATE_TEXTS } from '../screens/CreatePlanScreen.jsx'
import HealthScreen, { TEXTS as HEALTH_TEXTS } from '../screens/HealthScreen.jsx'
import HomeScreen, { TEXTS as HOME_TEXTS } from '../screens/HomeScreen.jsx'
import LoadingScreen from '../screens/LoadingScreen.jsx'
import LoginScreen, { TEXTS as LOGIN_TEXTS } from '../screens/LoginScreen.jsx'
import MyPlansScreen, { TEXTS as MY_PLANS_TEXTS } from '../screens/MyPlansScreen.jsx'
import OnboardingScreen from '../screens/OnboardingScreen.jsx'
import PlanQrScreen, { TEXTS as QR_TEXTS } from '../screens/PlanQrScreen.jsx'
import PlanScreen, { TEXTS as PLAN_TEXTS } from '../screens/PlanScreen.jsx'
import ProfileScreen from '../screens/ProfileScreen.jsx'
import RegisterScreen, { TEXTS as REGISTER_TEXTS } from '../screens/RegisterScreen.jsx'
import RestoreErrorScreen from '../screens/RestoreErrorScreen.jsx'
import { ROUTES } from './routes.js'

export { ROUTES }

export const TAB_TITLES = Object.freeze({ feed: 'Planes', myPlans: 'Mis planes', create: 'Crear', profile: 'Perfil' })

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

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

// Pantallas a las que se llega desde el detalle de un plan: van en cada stack que muestra planes ("Planes" y
// "Mis planes"), así "volver" regresa siempre al listado desde el que se entró.
function planScreens () {
  return (
    <>
      <Stack.Screen name={ROUTES.PLAN} component={PlanScreen} options={{ title: PLAN_TEXTS.title }} />
      <Stack.Screen name={ROUTES.EDIT_PLAN} component={CreatePlanScreen} options={{ title: CREATE_TEXTS.editTitle }} />
      <Stack.Screen name={ROUTES.PLAN_QR} component={PlanQrScreen} options={{ title: QR_TEXTS.title }} />
      <Stack.Screen name={ROUTES.CHECK_IN} component={CheckInScreen} options={{ title: CHECK_IN_TEXTS.title }} />
    </>
  )
}

// Tab "Planes": el feed, el detalle de un plan, su edición (solo el creador) y la asistencia.
function FeedStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.HOME}>
      <Stack.Screen name={ROUTES.HOME} component={HomeScreen} options={{ title: HOME_TEXTS.title }} />
      {planScreens()}
    </Stack.Navigator>
  )
}

// Tab "Mis planes": los que creó y aquellos en los que está inscripto.
function MyPlansStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.MY_PLANS}>
      <Stack.Screen name={ROUTES.MY_PLANS} component={MyPlansScreen} options={{ title: MY_PLANS_TEXTS.title }} />
      {planScreens()}
    </Stack.Navigator>
  )
}

function CreateStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.CREATE_PLAN}>
      <Stack.Screen name={ROUTES.CREATE_PLAN} component={CreatePlanScreen} options={{ title: CREATE_TEXTS.createTitle }} />
    </Stack.Navigator>
  )
}

function ProfileStack () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.PROFILE}>
      <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} options={{ title: 'Mi perfil' }} />
      <Stack.Screen name={ROUTES.HEALTH} component={HealthScreen} options={{ title: HEALTH_TEXTS.title }} />
    </Stack.Navigator>
  )
}

// Solo texto en la barra: la app no incluye una librería de íconos.
const TAB_OPTIONS = Object.freeze({
  headerShown: false,
  tabBarIconStyle: { display: 'none' },
  tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
  tabBarLabelPosition: 'beside-icon'
})

// La app con sesión: cuatro tabs, cada uno con su propio stack (su encabezado y su "volver").
function AppTabs () {
  return (
    <Tabs.Navigator initialRouteName={ROUTES.FEED_TAB} screenOptions={TAB_OPTIONS}>
      <Tabs.Screen name={ROUTES.FEED_TAB} component={FeedStack} options={{ title: TAB_TITLES.feed }} />
      <Tabs.Screen name={ROUTES.MY_PLANS_TAB} component={MyPlansStack} options={{ title: TAB_TITLES.myPlans }} />
      <Tabs.Screen name={ROUTES.CREATE_TAB} component={CreateStack} options={{ title: TAB_TITLES.create }} />
      <Tabs.Screen name={ROUTES.PROFILE_TAB} component={ProfileStack} options={{ title: TAB_TITLES.profile }} />
    </Tabs.Navigator>
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
  return user.onboardingCompleted ? <AppTabs /> : <OnboardingStack />
}
