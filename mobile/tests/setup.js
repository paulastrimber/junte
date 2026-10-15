// Setup de jest para toda la app. El AsyncStorage simulado guarda en memoria del archivo de test: se vacía antes de cada
// test para que lo que guardó uno (la caché de lecturas, la cola de pendientes) no cambie el resultado de otro.
import AsyncStorage from '@react-native-async-storage/async-storage'

beforeEach(async () => {
  await AsyncStorage.clear()
})
