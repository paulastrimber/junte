import { createNativeStackNavigator } from '@react-navigation/native-stack'

import HealthScreen, { TEXTS as HEALTH_TEXTS } from '../screens/HealthScreen.jsx'

// Stack mínimo del sprint 1. En S2-MOB-04 se separa en stack de auth y stack de app.
export const ROUTES = Object.freeze({
  HEALTH: 'Health'
})

const Stack = createNativeStackNavigator()

export function RootNavigator () {
  return (
    <Stack.Navigator initialRouteName={ROUTES.HEALTH}>
      <Stack.Screen
        name={ROUTES.HEALTH}
        component={HealthScreen}
        options={{ title: HEALTH_TEXTS.title }}
      />
    </Stack.Navigator>
  )
}
