// Mock de expo-notifications para jest: el módulo nativo no existe en los tests. Por defecto NO hay permiso y no hay
// aviso que haya abierto la app; cada test configura lo que necesita.
const subscription = () => ({ remove: jest.fn() })
module.exports = {
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  setNotificationChannelAsync: jest.fn(async () => null),
  getDevicePushTokenAsync: jest.fn(async () => { throw new Error('sin push en los tests') }),
  addPushTokenListener: jest.fn(subscription),
  addNotificationResponseReceivedListener: jest.fn(subscription),
  getLastNotificationResponseAsync: jest.fn(async () => null)
}
