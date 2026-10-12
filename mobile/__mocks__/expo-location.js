// Mock de expo-location para jest. Por defecto NO hay permiso (el caso que la app tiene que tolerar siempre);
// cada test configura lo que necesita con `mockResolvedValue`.
module.exports = {
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(async () => { throw new Error('sin posición en los tests') }),
  geocodeAsync: jest.fn(async () => [])
}
