import { createMemorySecureStore } from '../../tests/helpers/memory-secure-store.js'
import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'
import { createAuthService } from './auth.js'
import { createTokenStorage } from './tokenStorage.js'

const USER = { id: '1', email: 'ana@um.edu.uy', name: 'Ana' }

function setup ({ stored } = {}) {
  const secureStore = createMemorySecureStore(stored)
  const tokenStorage = createTokenStorage({ secureStore })
  const api = {
    register: jest.fn(async () => ({ user: USER, accessToken: 'access-1', refreshToken: 'refresh-1' })),
    login: jest.fn(async () => ({ user: USER, accessToken: 'access-1', refreshToken: 'refresh-1' })),
    refresh: jest.fn(async () => ({ accessToken: 'access-2', refreshToken: 'refresh-2' })),
    logout: jest.fn(async () => {}),
    logoutAll: jest.fn(async () => {}),
    getMe: jest.fn(async () => USER)
  }
  const service = createAuthService({ tokenStorage, api, deviceLabel: 'android' })
  return { service, api, tokenStorage, secureStore }
}

const SAVED = { 'junte.accessToken': 'access-0', 'junte.refreshToken': 'refresh-0' }
const unauthorized = () => new ApiError({ status: 401, code: 'UNAUTHENTICATED' })

describe('login y register', () => {
  it('login guarda los tokens en el almacenamiento seguro y devuelve el usuario', async () => {
    const { service, api, tokenStorage } = setup()

    const user = await service.login({ email: 'ana@um.edu.uy', password: 'secreto-123' })

    expect(user).toEqual(USER)
    expect(api.login).toHaveBeenCalledWith({ email: 'ana@um.edu.uy', password: 'secreto-123', deviceLabel: 'android' })
    expect(tokenStorage.getAccessToken()).toBe('access-1')
    expect(tokenStorage.getRefreshToken()).toBe('refresh-1')
  })

  it('register guarda los tokens y devuelve el usuario', async () => {
    const { service, api, tokenStorage } = setup()

    const user = await service.register({ name: 'Ana', email: 'ana@um.edu.uy', password: 'secreto-123' })

    expect(user).toEqual(USER)
    expect(api.register).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@um.edu.uy', password: 'secreto-123', deviceLabel: 'android' })
    expect(tokenStorage.getRefreshToken()).toBe('refresh-1')
  })

  it('si el login falla no guarda nada y propaga el error', async () => {
    const { service, api, tokenStorage, secureStore } = setup()
    api.login.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' }))

    await expect(service.login({ email: 'a@b.com', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })

    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(secureStore.data.size).toBe(0)
  })
})

describe('restore (al abrir la app)', () => {
  it('sin sesión guardada devuelve null sin llamar a la API', async () => {
    const { service, api } = setup()

    expect(await service.restore()).toBeNull()
    expect(api.getMe).not.toHaveBeenCalled()
  })

  it('con sesión guardada trae el perfil', async () => {
    const { service } = setup({ stored: SAVED })

    expect(await service.restore()).toEqual(USER)
  })

  it('si la sesión ya no sirve (401) borra los tokens y devuelve null', async () => {
    const { service, api, secureStore } = setup({ stored: SAVED })
    api.getMe.mockRejectedValue(unauthorized())

    expect(await service.restore()).toBeNull()
    expect(secureStore.data.size).toBe(0)
  })

  it('sin conexión propaga el error y CONSERVA los tokens (no es lo mismo que sesión vencida)', async () => {
    const { service, api, secureStore } = setup({ stored: SAVED })
    api.getMe.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    await expect(service.restore()).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    expect(secureStore.data.size).toBe(2)
  })

  it('sin conexión, con un perfil guardado, entra con ese perfil (S6: la app se abre sin red)', async () => {
    const saved = []
    const profileCache = { save: jest.fn(async (user) => { saved.push(user) }), load: jest.fn(async () => saved.at(-1) ?? null) }
    const secureStore = createMemorySecureStore(SAVED)
    const api = { getMe: jest.fn().mockResolvedValueOnce(USER).mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.TIMEOUT })) }
    const service = createAuthService({ tokenStorage: createTokenStorage({ secureStore }), api, deviceLabel: 'android', profileCache })

    expect(await service.restore()).toEqual(USER)
    expect(await service.restore()).toEqual(USER)
    expect(profileCache.save).toHaveBeenCalledWith(USER)
    expect(secureStore.data.size).toBe(2)
  })

  it('un 401 nunca entra con el perfil guardado: la sesión terminó', async () => {
    const profileCache = { save: jest.fn(), load: jest.fn(async () => USER) }
    const secureStore = createMemorySecureStore(SAVED)
    const api = { getMe: jest.fn().mockRejectedValue(unauthorized()) }
    const service = createAuthService({ tokenStorage: createTokenStorage({ secureStore }), api, deviceLabel: 'android', profileCache })

    expect(await service.restore()).toBeNull()
    expect(profileCache.load).not.toHaveBeenCalled()
  })
})

describe('refreshSession', () => {
  it('canjea el refresh token y guarda el par nuevo', async () => {
    const { service, api, tokenStorage } = setup({ stored: SAVED })
    await tokenStorage.load()

    await service.refreshSession()

    expect(api.refresh).toHaveBeenCalledWith({ refreshToken: 'refresh-0' })
    expect(tokenStorage.getAccessToken()).toBe('access-2')
    expect(tokenStorage.getRefreshToken()).toBe('refresh-2')
  })

  it('si el servidor lo rechaza (401) borra la sesión local', async () => {
    const { service, api, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()
    api.refresh.mockRejectedValue(unauthorized())

    await expect(service.refreshSession()).rejects.toMatchObject({ status: 401 })

    expect(secureStore.data.size).toBe(0)
  })

  it('si falla por red conserva la sesión para reintentar más tarde', async () => {
    const { service, api, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()
    api.refresh.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    await expect(service.refreshSession()).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })

    expect(secureStore.data.size).toBe(2)
    expect(tokenStorage.getRefreshToken()).toBe('refresh-0')
  })

  it('pedidos a la vez (HTTP y socket) comparten un solo canje del refresh token', async () => {
    const { service, api, tokenStorage } = setup({ stored: SAVED })
    await tokenStorage.load()

    await Promise.all([service.refreshSession(), service.refreshSession()])
    await service.refreshSession()

    // Dos juntos = 1 canje; el tercero, ya sin nada en vuelo, hace el suyo.
    expect(api.refresh).toHaveBeenCalledTimes(2)
  })

  it('sin refresh token rechaza con 401 sin llamar a la API', async () => {
    const { service, api } = setup()

    await expect(service.refreshSession()).rejects.toMatchObject({ status: 401 })
    expect(api.refresh).not.toHaveBeenCalled()
  })
})

describe('logout', () => {
  it('avisa al servidor y borra la sesión local', async () => {
    const { service, api, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()

    await service.logout()

    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(secureStore.data.size).toBe(0)
  })

  it('borra la sesión local aunque el servidor no responda (sin conexión)', async () => {
    const { service, api, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()
    api.logout.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    await expect(service.logout()).resolves.toBeUndefined()

    expect(secureStore.data.size).toBe(0)
    expect(tokenStorage.getAccessToken()).toBeNull()
  })

  it('antes de borrar la sesión local corre los ganchos (baja del token de push) con el token todavía guardado', async () => {
    const { service, tokenStorage } = setup({ stored: SAVED })
    await tokenStorage.load()
    const seen = []
    service.onBeforeLogout(() => { seen.push(tokenStorage.getAccessToken()) })
    service.onBeforeLogout(() => { throw new Error('un gancho que falla no frena el logout') })

    await service.logout()

    expect(seen).toEqual(['access-0'])
    expect(tokenStorage.getAccessToken()).toBeNull()
  })

  it('logoutAll cierra todas las sesiones y luego la local; si el servidor falla NO cierra nada', async () => {
    const { service, api, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()
    api.logoutAll.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    await expect(service.logoutAll()).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    expect(secureStore.data.size).toBe(2)

    await service.logoutAll()

    expect(secureStore.data.size).toBe(0)
  })
})

describe('sesión vencida', () => {
  it('handleSessionExpired borra los tokens y avisa a los suscriptores una vez cada uno', async () => {
    const { service, tokenStorage, secureStore } = setup({ stored: SAVED })
    await tokenStorage.load()
    const listener = jest.fn()
    const unsubscribe = service.onSessionExpired(listener)
    const reason = unauthorized()

    await service.handleSessionExpired(reason)

    expect(listener).toHaveBeenCalledWith(reason)
    expect(secureStore.data.size).toBe(0)

    unsubscribe()
    await service.handleSessionExpired(reason)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('onSessionEnded avisa en logout, logoutAll y sesión vencida (para soltar el socket)', async () => {
    const { service, tokenStorage } = setup({ stored: SAVED })
    await tokenStorage.load()
    const listener = jest.fn()
    const unsubscribe = service.onSessionEnded(listener)

    await service.logout()
    await service.logoutAll()
    await service.handleSessionExpired(unauthorized())
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    await service.logout()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('expone al cliente HTTP lo que necesita (apiAuth)', async () => {
    const { service, tokenStorage } = setup({ stored: SAVED })
    await tokenStorage.load()

    expect(service.apiAuth.getAccessToken()).toBe('access-0')
    expect(service.apiAuth.refreshSession).toBe(service.refreshSession)
  })
})
