import { createMemorySecureStore } from '../../tests/helpers/memory-secure-store.js'
import { createTokenStorage } from './tokenStorage.js'

describe('tokenStorage', () => {
  it('guarda los tokens en el almacenamiento seguro y los deja en memoria', async () => {
    const secureStore = createMemorySecureStore()
    const storage = createTokenStorage({ secureStore })

    await storage.save({ accessToken: 'access-1', refreshToken: 'refresh-1' })

    expect(storage.getAccessToken()).toBe('access-1')
    expect(storage.getRefreshToken()).toBe('refresh-1')
    expect([...secureStore.data.values()].sort()).toEqual(['access-1', 'refresh-1'])
  })

  it('load recupera lo guardado en una sesión anterior de la app', async () => {
    const secureStore = createMemorySecureStore()
    await createTokenStorage({ secureStore }).save({ accessToken: 'a', refreshToken: 'r' })
    const reopened = createTokenStorage({ secureStore })
    expect(reopened.getAccessToken()).toBeNull()

    const loaded = await reopened.load()

    expect(loaded).toBe(true)
    expect(reopened.getAccessToken()).toBe('a')
    expect(reopened.getRefreshToken()).toBe('r')
  })

  it('load devuelve false si no hay sesión guardada o falta uno de los dos tokens', async () => {
    const secureStore = createMemorySecureStore()
    const storage = createTokenStorage({ secureStore })
    expect(await storage.load()).toBe(false)

    await secureStore.setItemAsync('junte.refreshToken', 'solo-refresh')

    expect(await createTokenStorage({ secureStore }).load()).toBe(false)
  })

  it('clear borra memoria y almacenamiento', async () => {
    const secureStore = createMemorySecureStore()
    const storage = createTokenStorage({ secureStore })
    await storage.save({ accessToken: 'a', refreshToken: 'r' })

    await storage.clear()

    expect(storage.getAccessToken()).toBeNull()
    expect(storage.getRefreshToken()).toBeNull()
    expect(secureStore.data.size).toBe(0)
  })

  it('si el almacenamiento seguro falla al leer, load da false (la app pide iniciar sesión) y no lanza', async () => {
    const secureStore = createMemorySecureStore()
    secureStore.getItemAsync.mockRejectedValue(new Error('keystore unavailable'))
    const storage = createTokenStorage({ secureStore })

    await expect(storage.load()).resolves.toBe(false)
  })

  it('nunca usa AsyncStorage ni escribe en consola', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const secureStore = createMemorySecureStore()
    const storage = createTokenStorage({ secureStore })

    await storage.save({ accessToken: 'secreto-access', refreshToken: 'secreto-refresh' })
    await storage.load()
    await storage.clear()

    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
