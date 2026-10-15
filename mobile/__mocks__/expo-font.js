// Mock de expo-font para jest: en los tests no hay archivos de fuente que cargar (tipografía e íconos).
module.exports = {
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(async () => {}),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false)
}
