import { act, renderHook, waitFor } from '@testing-library/react-native'

import { COMPLETE_USER, createFakeAuthService } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { AuthProvider } from '../contexts/AuthContext.jsx'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { leavePlan, listParticipants } from '../services/api/participations.js'
import { getPlan, updatePlan } from '../services/api/plans.js'
import { requestCameraPermission } from '../services/camera.js'
import { pickProfileImage } from '../services/imagePicker.js'
import { uploadProfilePhoto } from '../services/photoUpload.js'
import { CAMERA_PERMISSION, useCameraPermission } from './useCameraPermission.js'
import { resetCatalogsCache } from './useCatalogs.js'
import { PLAN_ACTION } from './usePlanActions.js'
import { usePlanDetail } from './usePlanDetail.js'
import { useProfilePhoto } from './useProfilePhoto.js'
import { useRefreshOnFocus, useScreenFocus } from './useScreenFocus.js'
import { useSessionActions } from './useSessionActions.js'

jest.mock('../services/camera.js', () => ({ requestCameraPermission: jest.fn() }))
jest.mock('../services/imagePicker.js', () => ({ pickProfileImage: jest.fn() }))
jest.mock('../services/photoUpload.js', () => ({ uploadProfilePhoto: jest.fn() }))
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ getPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))

const apiError = (status, code) => new ApiError({ status, code, requestId: 'r1' })

/** Navegación falsa que guarda los listeners para emitir `focus` / `blur` a mano, como React Navigation. */
function fakeNavigation () {
  const listeners = { focus: new Set(), blur: new Set() }
  return {
    addListener: jest.fn((event, handler) => {
      listeners[event].add(handler)
      return () => listeners[event].delete(handler)
    }),
    emit: async (event) => act(async () => listeners[event].forEach((handler) => handler())),
    count: (event) => listeners[event].size
  }
}

function withAuth (service) {
  return function Wrapper ({ children }) {
    return <AuthProvider service={service}>{children}</AuthProvider>
  }
}

describe('useScreenFocus', () => {
  it('sigue los eventos focus / blur y deja de escuchar al desmontar', async () => {
    const navigation = fakeNavigation()
    const { result, unmount } = await renderHook(() => useScreenFocus(navigation))
    expect(result.current).toBe(true)

    await navigation.emit('blur')
    expect(result.current).toBe(false)
    await navigation.emit('focus')
    expect(result.current).toBe(true)

    await unmount()
    expect(navigation.count('focus')).toBe(0)
    expect(navigation.count('blur')).toBe(0)
  })
})

describe('useRefreshOnFocus', () => {
  it('ignora el focus del montaje y refresca en cada vuelta a la pantalla, con el refresh más reciente', async () => {
    const navigation = fakeNavigation()
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = await renderHook(({ refresh }) => useRefreshOnFocus(navigation, refresh), { initialProps: { refresh: first } })

    await navigation.emit('focus')
    expect(first).not.toHaveBeenCalled()

    await navigation.emit('focus')
    expect(first).toHaveBeenCalledTimes(1)

    // Un `refresh` nuevo (otra consulta) no vuelve a suscribirse ni a ignorar un focus.
    await rerender({ refresh: second })
    await navigation.emit('focus')
    expect(second).toHaveBeenCalledTimes(1)
    expect(navigation.addListener).toHaveBeenCalledTimes(1)
  })
})

describe('useCameraPermission', () => {
  it('pide el permiso al montar y queda granted o denied', async () => {
    requestCameraPermission.mockResolvedValueOnce(true)
    const { result } = await renderHook(() => useCameraPermission())
    await waitFor(() => expect(result.current.status).toBe(CAMERA_PERMISSION.GRANTED))
  })

  it('retry vuelve a preguntar (p. ej. después de darlo en los ajustes)', async () => {
    requestCameraPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { result } = await renderHook(() => useCameraPermission())
    await waitFor(() => expect(result.current.status).toBe(CAMERA_PERMISSION.DENIED))

    await act(async () => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe(CAMERA_PERMISSION.GRANTED))
    expect(requestCameraPermission).toHaveBeenCalledTimes(2)
  })
})

describe('useProfilePhoto', () => {
  it('si la subida falla expone un ViewError (no un texto suelto) y conserva el requestId', async () => {
    pickProfileImage.mockResolvedValue({ uri: 'file://foto.jpg' })
    uploadProfilePhoto.mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.UPLOAD_FAILED))
    const { result } = await renderHook(() => useProfilePhoto(), { wrapper: withAuth(createFakeAuthService({ user: COMPLETE_USER })) })

    await act(async () => result.current.choosePhoto())

    expect(result.current.error).toEqual({ code: CLIENT_ERROR_CODES.UPLOAD_FAILED, message: expect.any(String), requestId: 'r1' })
    expect(result.current.isUploading).toBe(false)
  })

  it('cancelar la elección no es un error', async () => {
    pickProfileImage.mockResolvedValue(null)
    const { result } = await renderHook(() => useProfilePhoto(), { wrapper: withAuth(createFakeAuthService({ user: COMPLETE_USER })) })

    await act(async () => result.current.choosePhoto())

    expect(result.current.error).toBeNull()
    expect(uploadProfilePhoto).not.toHaveBeenCalled()
  })
})

describe('useSessionActions', () => {
  it('si cerrar sesión en todos los dispositivos falla, expone un ViewError y deja volver a intentar', async () => {
    const service = createFakeAuthService({ user: COMPLETE_USER, logoutAll: jest.fn().mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)) })
    const { result } = await renderHook(() => useSessionActions(), { wrapper: withAuth(service) })

    await act(async () => result.current.signOutAll())

    expect(result.current.error).toEqual({ code: CLIENT_ERROR_CODES.NETWORK_ERROR, message: 'No pudimos conectarnos con el servidor. Revisá tu conexión.', requestId: 'r1' })
    expect(result.current.isWorking).toBe(false)
  })
})

describe('usePlanDetail', () => {
  const HOUR_MS = 60 * 60 * 1000
  const fromNow = (ms) => new Date(Date.now() + ms).toISOString()
  const plan = (overrides = {}) => ({
    id: 'p1',
    title: 'Fútbol 5',
    startsAt: fromNow(48 * HOUR_MS),
    endsAt: fromNow(50 * HOUR_MS),
    location: { label: 'Parque Rodó' },
    interests: ['futbol', 'ajedrez'],
    capacity: 10,
    participantCount: 3,
    availableSpots: 7,
    isFull: false,
    price: 0,
    status: 'open',
    creator: { id: 'u2', name: 'Lucía', photoUrl: null, reputation: 3 },
    isCreator: false,
    checkInOpensAt: fromNow(48 * HOUR_MS - 15 * 60 * 1000),
    checkInClosesAt: fromNow(49 * HOUR_MS),
    myParticipation: { status: 'active', joinedAt: fromNow(-HOUR_MS), checkedInAt: null, noShow: false },
    ...overrides
  })

  beforeEach(() => {
    resetCatalogsCache()
    getCatalogs.mockResolvedValue({ interestCategories: [{ key: 'deportes', name: 'Deportes', interests: [{ key: 'futbol', name: 'Fútbol' }] }] })
    listParticipants.mockResolvedValue({ items: [], nextCursor: null })
  })

  async function renderDetail () {
    const navigation = fakeNavigation()
    const view = await renderHook(() => usePlanDetail('p1', { navigation }))
    await waitFor(() => expect(view.result.current.status).toBe('ready'))
    return { ...view, navigation }
  }

  it('devuelve el plan con lo que se puede hacer y los nombres de las actividades', async () => {
    getPlan.mockResolvedValue(plan())
    const { result } = await renderDetail()

    expect(result.current.can).toMatchObject({ isJoined: true, canLeave: true })
    await waitFor(() => expect(result.current.activities).toEqual(['Fútbol', 'ajedrez']))
    expect(result.current.confirmation.action).toBeNull()
  })

  it('darse de baja pasa por la confirmación; "seguir" no manda nada y "confirmar" sí', async () => {
    getPlan.mockResolvedValue(plan())
    leavePlan.mockResolvedValue()
    const { result } = await renderDetail()

    await act(async () => result.current.confirmation.askLeave())
    expect(result.current.confirmation.action).toBe(PLAN_ACTION.LEAVE)
    await act(async () => result.current.confirmation.dismiss())
    expect(result.current.confirmation.action).toBeNull()
    expect(leavePlan).not.toHaveBeenCalled()

    await act(async () => result.current.confirmation.askLeave())
    await act(async () => result.current.confirmation.confirm())

    expect(leavePlan).toHaveBeenCalledWith('p1')
    expect(result.current.confirmation.action).toBeNull()
  })

  it('si cancelar falla, cierra la confirmación y deja el error de la acción', async () => {
    getPlan.mockResolvedValue(plan({ isCreator: true, myParticipation: null }))
    updatePlan.mockRejectedValue(apiError(409, 'PLAN_CLOSED'))
    const { result } = await renderDetail()

    await act(async () => result.current.confirmation.askCancel())
    await act(async () => result.current.confirmation.confirm())

    expect(updatePlan).toHaveBeenCalledWith('p1', { status: 'cancelled' })
    expect(result.current.confirmation.action).toBeNull()
    expect(result.current.actions.error).toEqual({ code: 'PLAN_CLOSED', message: 'El plan ya terminó o ya estaba cancelado.', requestId: 'r1' })
  })

  it('al volver a la pantalla vuelve a pedir el plan y los anotados (el focus del montaje no)', async () => {
    getPlan.mockResolvedValue(plan())
    const { navigation } = await renderDetail()
    await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(1))

    await navigation.emit('focus')
    expect(getPlan).toHaveBeenCalledTimes(1)

    await navigation.emit('focus')
    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(2))
  })

  it('al volver a la pantalla, los anotados siguen a la vista mientras llega la lista nueva (no vuelven a "cargando")', async () => {
    getPlan.mockResolvedValue(plan())
    const again = deferred()
    listParticipants.mockResolvedValueOnce({ items: [{ id: 'u3', name: 'Ana' }], nextCursor: null }).mockReturnValueOnce(again.promise)
    const { result, navigation } = await renderDetail()
    await waitFor(() => expect(result.current.participants.status).toBe('ready'))
    await navigation.emit('focus')

    await navigation.emit('focus')
    await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(2))

    expect(result.current.participants).toMatchObject({ status: 'ready', items: [{ id: 'u3', name: 'Ana' }] })
    await act(async () => again.resolve({ items: [], nextCursor: null }))
    expect(result.current.participants.items).toEqual([])
  })

  it('si falla un refresco (sin red), el plan sigue a la vista con refreshError', async () => {
    getPlan.mockResolvedValueOnce(plan()).mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR))
    const { result, navigation } = await renderDetail()
    await navigation.emit('focus')

    await navigation.emit('focus')
    await waitFor(() => expect(result.current.refreshError).toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR }))

    expect(result.current).toMatchObject({ status: 'ready', plan: { id: 'p1' } })
  })
})
