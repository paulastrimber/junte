import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Image } from 'expo-image'

import { AUTH_STATUS, AuthProvider } from './AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'

// A diferencia de AuthContext.test.jsx, acá `Avatar` es el real: se verifica que cerrar sesión llegue hasta los
// cachés de expo-image (memoria y disco), no solo que se llame a `clearPhotoCache`.
const USER = { id: '1', name: 'Ana', email: 'ana@um.edu.uy' }

function fakeService (overrides = {}) {
  return {
    restore: jest.fn(async () => USER),
    login: jest.fn(async () => USER),
    register: jest.fn(async () => USER),
    logout: jest.fn(async () => {}),
    logoutAll: jest.fn(async () => {}),
    onSessionExpired: jest.fn(() => () => {}),
    ...overrides
  }
}

async function signedInAuth (service) {
  const wrapper = ({ children }) => <AuthProvider service={service}>{children}</AuthProvider>
  const view = await renderHook(() => useAuth(), { wrapper })
  await waitFor(() => expect(view.result.current.status).toBe(AUTH_STATUS.SIGNED_IN))
  return view
}

beforeEach(() => {
  jest.spyOn(Image, 'clearMemoryCache').mockResolvedValue(true)
  jest.spyOn(Image, 'clearDiskCache').mockResolvedValue(true)
})
afterEach(() => jest.restoreAllMocks())

describe('AuthProvider: caché de fotos de expo-image', () => {
  it('signOut vacía memoria y disco', async () => {
    const { result } = await signedInAuth(fakeService())
    expect(Image.clearMemoryCache).not.toHaveBeenCalled()

    await act(async () => { await result.current.signOut() })

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('signOutAll vacía memoria y disco', async () => {
    const { result } = await signedInAuth(fakeService())

    await act(async () => { await result.current.signOutAll() })

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('si vaciar el disco falla, igual se cierra la sesión', async () => {
    Image.clearDiskCache.mockRejectedValue(new Error('disco'))
    const { result } = await signedInAuth(fakeService())

    await act(async () => { await result.current.signOut() })

    expect(result.current.status).toBe(AUTH_STATUS.SIGNED_OUT)
  })
})
