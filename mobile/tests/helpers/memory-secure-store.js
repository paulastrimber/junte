// expo-secure-store en memoria para tests (el real necesita Keychain/Keystore del teléfono).
export function createMemorySecureStore (initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItemAsync: jest.fn(async (key) => data.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => { data.set(key, value) }),
    deleteItemAsync: jest.fn(async (key) => { data.delete(key) })
  }
}
