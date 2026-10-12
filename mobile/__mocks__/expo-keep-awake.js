// Mock de expo-keep-awake para jest: el módulo nativo no existe en los tests.
module.exports = {
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn()
}
