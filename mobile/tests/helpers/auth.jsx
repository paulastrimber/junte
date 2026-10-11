import { render } from '@testing-library/react-native'

import { AUTH_STATUS, AuthProvider } from '../../src/contexts/AuthContext.jsx'
import { useAuth } from '../../src/hooks/useAuth.js'

export const USER = Object.freeze({
  id: '1',
  email: 'ana@um.edu.uy',
  name: 'Ana',
  birthDate: null,
  age: null,
  university: null,
  neighborhood: null,
  city: null,
  interests: [],
  reputation: 0,
  photoUrl: null,
  profileComplete: false,
  createdAt: '2026-10-11T15:00:00.000Z'
})

export const COMPLETE_USER = Object.freeze({
  ...USER,
  birthDate: '2001-03-09',
  age: 25,
  university: 'Universidad de Montevideo',
  neighborhood: 'Pocitos',
  city: 'Montevideo',
  interests: ['futbol', 'cine'],
  profileComplete: true
})

/** Servicio de sesión falso: nada toca SecureStore ni la red. `user` es la sesión que "había guardada". */
export function createFakeAuthService ({ user = null, ...overrides } = {}) {
  let expiredListener = null
  return {
    restore: jest.fn(async () => user),
    login: jest.fn(async () => USER),
    register: jest.fn(async () => USER),
    logout: jest.fn(async () => {}),
    logoutAll: jest.fn(async () => {}),
    onSessionExpired: jest.fn((listener) => { expiredListener = listener; return () => { expiredListener = null } }),
    expire: (reason) => expiredListener?.(reason),
    ...overrides
  }
}

/** Renderiza dentro de un AuthProvider con el servicio falso. */
export async function renderWithAuth (ui, { service = createFakeAuthService() } = {}) {
  const view = await render(<AuthProvider service={service}>{ui}</AuthProvider>)
  return { ...view, service }
}

/** Como en la app real: las pantallas protegidas solo existen con la sesión ya restaurada. */
export function SignedIn ({ children }) {
  const { status } = useAuth()
  return status === AUTH_STATUS.SIGNED_IN ? children : null
}
