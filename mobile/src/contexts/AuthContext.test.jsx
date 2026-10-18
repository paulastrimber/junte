import { act, renderHook, waitFor } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { clearPhotoCache } from '../components/Avatar.jsx'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { AUTH_STATUS, AuthProvider } from './AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'

jest.mock('../components/Avatar.jsx', () => ({ clearPhotoCache: jest.fn(async () => {}) }))

const USER = { id: '1', name: 'Ana', email: 'ana@um.edu.uy' }

function fakeService (overrides = {}) {
  let expiredListener = null
  return {
    restore: jest.fn(async () => null),
    login: jest.fn(async () => USER),
    register: jest.fn(async () => USER),
    logout: jest.fn(async () => {}),
    logoutAll: jest.fn(async () => {}),
    onSessionExpired: jest.fn((listener) => { expiredListener = listener; return () => { expiredListener = null } }),
    expire: (error) => expiredListener?.(error),
    isSubscribed: () => expiredListener !== null,
    ...overrides
  }
}

async function setup (service) {
  const wrapper = ({ children }) => <AuthProvider service={service}>{children}</AuthProvider>
  return renderHook(() => useAuth(), { wrapper })
}

describe('AuthProvider', () => {
  it('arranca cargando y, sin sesión guardada, queda signedOut', async () => {
    const pending = deferred()
    const service = fakeService({ restore: jest.fn(() => pending.promise) })

    const { result } = await setup(service)
    expect(result.current.status).toBe(AUTH_STATUS.LOADING)

    await act(async () => pending.resolve(null))

    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)
    expect(result.current.user).toBeNull()
  })

  it('con una sesión válida restaura el usuario y queda signedIn', async () => {
    const service = fakeService({ restore: jest.fn(async () => USER) })

    const { result } = await setup(service)

    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))
    expect(result.current.user).toEqual(USER)
  })

  it('si no se puede verificar la sesión (sin red) queda en restoreError y permite reintentar', async () => {
    const error = new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    const service = fakeService({ restore: jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(USER) })

    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.RESTORE_ERROR))
    expect(result.current.error).toEqual({ code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: 'No pudimos conectarnos con el servidor. Revisá tu conexión.', requestId: null })

    await act(async () => { await result.current.retryRestore() })

    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN)
    expect(result.current.error).toBeNull()
  })

  it('signIn guarda el usuario y pasa a signedIn; si falla propaga el error y sigue signedOut', async () => {
    const service = fakeService({ login: jest.fn().mockRejectedValueOnce(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' })).mockResolvedValueOnce(USER) })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT))

    await act(async () => {
      await expect(result.current.signIn({ email: 'a@b.com', password: 'mala' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)

    await act(async () => { await result.current.signIn({ email: 'a@b.com', password: 'buena-123' }) })
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN)
    expect(result.current.user).toEqual(USER)
  })

  it('signUp registra y pasa a signedIn', async () => {
    const service = fakeService()
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT))

    await act(async () => { await result.current.signUp({ name: 'Ana', email: 'ana@um.edu.uy', password: 'secreto-123' }) })

    expect(service.register).toHaveBeenCalledWith({ name: 'Ana', email: 'ana@um.edu.uy', password: 'secreto-123' })
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN)
  })

  it('signOut cierra la sesión y vuelve a signedOut', async () => {
    const service = fakeService({ restore: jest.fn(async () => USER) })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))

    await act(async () => { await result.current.signOut() })

    expect(service.logout).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)
    expect(result.current.user).toBeNull()
    // Las fotos de otras personas no quedan en el caché para la próxima sesión.
    expect(clearPhotoCache).toHaveBeenCalledTimes(1)
  })

  it('signOutAll cierra todas; si el servidor falla sigue signedIn y propaga el error', async () => {
    const service = fakeService({
      restore: jest.fn(async () => USER),
      logoutAll: jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(undefined)
    })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))

    await act(async () => { await expect(result.current.signOutAll()).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR }) })
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN)
    expect(clearPhotoCache).not.toHaveBeenCalled()

    await act(async () => { await result.current.signOutAll() })
    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)
    expect(clearPhotoCache).toHaveBeenCalledTimes(1)
  })

  it('cuando el cliente HTTP avisa que la sesión terminó vuelve a signedOut y guarda el motivo', async () => {
    const service = fakeService({ restore: jest.fn(async () => USER) })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))
    const reason = new ApiError({ status: 401, code: 'ACCOUNT_SUSPENDED' })

    await act(async () => service.expire(reason))

    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)
    expect(result.current.user).toBeNull()
    expect(result.current.sessionEndedBy).toBe(reason)
    expect(clearPhotoCache).toHaveBeenCalledTimes(1)
  })

  it('iniciar sesión de nuevo limpia el motivo anterior', async () => {
    const service = fakeService({ restore: jest.fn(async () => USER) })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))
    await act(async () => service.expire(new ApiError({ status: 401, code: 'UNAUTHENTICATED' })))

    await act(async () => { await result.current.signIn({ email: 'a@b.com', password: 'x' }) })

    expect(result.current.sessionEndedBy).toBeNull()
  })

  it('setUser reemplaza el perfil (después de editarlo)', async () => {
    const service = fakeService({ restore: jest.fn(async () => USER) })
    const { result } = await setup(service)
    await waitFor(() => expect(result.current.status).toBe(AUTH_STATUS.SIGNED_IN))

    await act(async () => result.current.setUser({ ...USER, city: 'Montevideo' }))

    expect(result.current.user.city).toBe('Montevideo')
  })

  it('se desuscribe al desmontar', async () => {
    const service = fakeService()
    const { unmount } = await setup(service)
    expect(service.isSubscribed()).toBe(true)

    await unmount()

    expect(service.isSubscribed()).toBe(false)
  })

  it('useAuth fuera del provider falla con un mensaje claro', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(renderHook(() => useAuth())).rejects.toThrow(/AuthProvider/)

    error.mockRestore()
  })
})
