import { act, renderHook, waitFor } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { checkIn, createPlanQr } from '../services/api/checkins.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { joinPlan, leavePlan, listParticipants } from '../services/api/participations.js'
import { listMyPlans, updatePlan } from '../services/api/plans.js'
import { getMe } from '../services/api/users.js'
import { LOCATION_STATUS, getPreciseLocation } from '../services/location.js'
import { CHECK_IN_LOCAL_ERRORS, CHECK_IN_STATUS, useCheckIn } from './useCheckIn.js'
import { useMyPlans } from './useMyPlans.js'
import { useMyStats } from './useMyStats.js'
import { LIST_STATUS } from './usePagedList.js'
import { useParticipants } from './useParticipants.js'
import { PLAN_ACTION, usePlanActions } from './usePlanActions.js'
import { QR_STATUS, usePlanQr } from './usePlanQr.js'

jest.mock('../services/api/checkins.js', () => ({ checkIn: jest.fn(), createPlanQr: jest.fn() }))
jest.mock('../services/api/participations.js', () => ({ joinPlan: jest.fn(), leavePlan: jest.fn(), listParticipants: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ listMyPlans: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn() }))
jest.mock('../services/location.js', () => ({
  LOCATION_STATUS: { GRANTED: 'granted', DENIED: 'denied', UNAVAILABLE: 'unavailable' },
  getPreciseLocation: jest.fn()
}))

const HERE = { status: LOCATION_STATUS.GRANTED, latitude: -34.9, longitude: -56.16, accuracyMeters: 12 }
const apiError = (status, code, message) => new ApiError({ status, code, message, requestId: 'r1' })

beforeEach(() => jest.resetAllMocks())

describe('usePlanActions', () => {
  it('inscribirse: mientras espera queda pendiente; al confirmar el servidor avisa con onChanged', async () => {
    const pending = deferred()
    joinPlan.mockReturnValue(pending.promise)
    const onChanged = jest.fn()
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged }))

    let outcome
    await act(async () => { outcome = result.current.join() })
    expect(result.current).toMatchObject({ pending: PLAN_ACTION.JOIN, isBusy: true })
    expect(onChanged).not.toHaveBeenCalled()

    await act(async () => pending.resolve({}))

    expect(await outcome).toBe(true)
    expect(result.current).toMatchObject({ pending: null, isBusy: false, error: null })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('un segundo toque mientras hay un pedido en curso no manda otro', async () => {
    const pending = deferred()
    joinPlan.mockReturnValue(pending.promise)
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged: jest.fn() }))

    await act(async () => { result.current.join() })
    await act(async () => { result.current.join() })
    await act(async () => pending.resolve({}))

    expect(joinPlan).toHaveBeenCalledTimes(1)
  })

  it('un rechazo deja el mensaje según el code y también pide refrescar el plan', async () => {
    joinPlan.mockRejectedValue(apiError(409, 'PLAN_FULL', 'texto del servidor'))
    const onChanged = jest.fn()
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged }))

    let outcome
    await act(async () => { outcome = await result.current.join() })

    expect(outcome).toBe(false)
    expect(result.current.error).toEqual({ message: 'El plan se llenó: ya no quedan lugares.', requestId: 'r1', code: 'PLAN_FULL' })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('el mismo code se explica distinto en cada acción', async () => {
    leavePlan.mockRejectedValue(apiError(409, 'PLAN_CLOSED'))
    updatePlan.mockRejectedValue(apiError(409, 'PLAN_CLOSED'))
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged: jest.fn() }))

    await act(async () => { await result.current.leave() })
    const leaveMessage = result.current.error.message
    await act(async () => { await result.current.cancel() })

    expect(leaveMessage).toMatch(/darte de baja/)
    expect(result.current.error.message).toBe('El plan ya terminó o ya estaba cancelado.')
  })

  it('un error de red usa el mensaje general', async () => {
    leavePlan.mockRejectedValue(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR))
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged: jest.fn() }))

    await act(async () => { await result.current.leave() })

    expect(result.current.error.message).toMatch(/conexión/)
  })

  it('cerrar, reabrir y cancelar mandan el status que corresponde', async () => {
    updatePlan.mockResolvedValue({})
    const { result } = await renderHook(() => usePlanActions('p1', { onChanged: jest.fn() }))

    await act(async () => { await result.current.closeSignUps() })
    await act(async () => { await result.current.reopenSignUps() })
    await act(async () => { await result.current.cancel() })

    expect(updatePlan.mock.calls).toEqual([['p1', { status: 'closed' }], ['p1', { status: 'open' }], ['p1', { status: 'cancelled' }]])
  })
})

describe('usePlanQr', () => {
  const NOW = new Date('2026-10-25T21:00:00.000Z')
  const qr = (n, secondsLeft = 90) => ({ qrToken: `p1.token-${n}`, expiresAt: new Date(NOW.getTime() + secondsLeft * 1000).toISOString() })

  beforeEach(() => jest.useFakeTimers({ now: NOW }))
  afterEach(() => jest.useRealTimers())

  it('pide un QR al entrar y lo renueva solo 15 segundos antes de que venza', async () => {
    createPlanQr.mockResolvedValueOnce(qr(1)).mockResolvedValueOnce(qr(2, 165))
    const { result } = await renderHook(() => usePlanQr('p1'))
    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.READY))
    expect(result.current.qrToken).toBe('p1.token-1')

    await act(async () => jest.advanceTimersByTime(74_000))
    expect(createPlanQr).toHaveBeenCalledTimes(1)

    await act(async () => jest.advanceTimersByTime(1_000))

    await waitFor(() => expect(result.current.qrToken).toBe('p1.token-2'))
    expect(createPlanQr).toHaveBeenCalledTimes(2)
  })

  it('aunque el QR esté por vencer, no pide otro antes de 5 segundos', async () => {
    createPlanQr.mockResolvedValue(qr(1, 10))
    const { result } = await renderHook(() => usePlanQr('p1'))
    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.READY))

    await act(async () => jest.advanceTimersByTime(4_900))
    expect(createPlanQr).toHaveBeenCalledTimes(1)

    await act(async () => jest.advanceTimersByTime(200))
    expect(createPlanQr).toHaveBeenCalledTimes(2)
  })

  it('al salir de la pantalla deja de pedir', async () => {
    createPlanQr.mockResolvedValue(qr(1))
    const { result, unmount } = await renderHook(() => usePlanQr('p1'))
    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.READY))

    await unmount()
    await act(async () => jest.advanceTimersByTime(10 * 60_000))

    expect(createPlanQr).toHaveBeenCalledTimes(1)
  })

  it.each(['CHECKIN_WINDOW_CLOSED', 'PLAN_CLOSED', 'FORBIDDEN'])('%s: no disponible, sin reintentos automáticos', async (code) => {
    createPlanQr.mockRejectedValue(apiError(409, code))
    const { result } = await renderHook(() => usePlanQr('p1'))

    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.UNAVAILABLE))
    await act(async () => jest.advanceTimersByTime(10 * 60_000))

    expect(result.current.error).toMatchObject({ code, message: expect.any(String) })
    expect(createPlanQr).toHaveBeenCalledTimes(1)
  })

  it('un error de red se puede reintentar a mano', async () => {
    createPlanQr.mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)).mockResolvedValueOnce(qr(1))
    const { result } = await renderHook(() => usePlanQr('p1'))
    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.ERROR))

    await act(async () => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe(QR_STATUS.READY))
  })
})

describe('useCheckIn', () => {
  it('toma la ubicación con su precisión y la manda junto con el QR', async () => {
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockResolvedValue({ planId: 'p1', method: 'qr-location', distanceMeters: 8 })
    const { result } = await renderHook(() => useCheckIn('p1'))

    let ok
    await act(async () => { ok = await result.current.submit({ qrToken: 'p1.abc' }) })

    expect(ok).toBe(true)
    expect(result.current).toMatchObject({ status: CHECK_IN_STATUS.DONE, result: { method: 'qr-location' }, error: null, isWorking: false })
    expect(checkIn).toHaveBeenCalledWith('p1', { qrToken: 'p1.abc', latitude: -34.9, longitude: -56.16, accuracyMeters: 12 })
  })

  it('pasa por "obteniendo ubicación" y "enviando"', async () => {
    const location = deferred()
    const response = deferred()
    getPreciseLocation.mockReturnValue(location.promise)
    checkIn.mockReturnValue(response.promise)
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => { result.current.submit({ qrToken: 'p1.abc' }) })
    expect(result.current).toMatchObject({ status: CHECK_IN_STATUS.LOCATING, isWorking: true })

    await act(async () => location.resolve(HERE))
    expect(result.current.status).toBe(CHECK_IN_STATUS.SENDING)

    await act(async () => response.resolve({}))
    expect(result.current.status).toBe(CHECK_IN_STATUS.DONE)
  })

  it('el creador inscripto no manda qrToken', async () => {
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockResolvedValue({ method: 'location' })
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => { await result.current.submit() })

    expect(checkIn).toHaveBeenCalledWith('p1', { latitude: -34.9, longitude: -56.16, accuracyMeters: 12 })
  })

  it('la cámara lee el mismo QR varias veces: se manda una sola', async () => {
    const response = deferred()
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockReturnValue(response.promise)
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => {
      result.current.submit({ qrToken: 'p1.abc' })
      result.current.submit({ qrToken: 'p1.abc' })
    })
    await act(async () => response.resolve({}))

    expect(checkIn).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sin permiso de ubicación', LOCATION_STATUS.DENIED, CHECK_IN_LOCAL_ERRORS.LOCATION_DENIED, /permiso/],
    ['sin posición', LOCATION_STATUS.UNAVAILABLE, CHECK_IN_LOCAL_ERRORS.LOCATION_UNAVAILABLE, /GPS/]
  ])('%s: lo explica, no llama al servidor y se puede reintentar', async (_label, status, code, message) => {
    getPreciseLocation.mockResolvedValue({ status })
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => { await result.current.submit({ qrToken: 'p1.abc' }) })

    expect(result.current.error).toMatchObject({ code, message: expect.stringMatching(message), canRetry: true })
    expect(checkIn).not.toHaveBeenCalled()
  })

  it('algo que no es un QR de asistencia (texto larguísimo) se rechaza sin pedir la ubicación', async () => {
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => { await result.current.submit({ qrToken: 'x'.repeat(500) }) })

    expect(result.current.error).toMatchObject({ code: 'QR_INVALID', canRetry: true })
    expect(getPreciseLocation).not.toHaveBeenCalled()
  })

  it.each([
    ['QR_INVALID', 403, /QR actual/, true],
    ['CHECKIN_WINDOW_CLOSED', 409, /Fuera de horario/, false],
    ['ALREADY_CHECKED_IN', 409, /Ya habías registrado/, false],
    ['FORBIDDEN', 403, /inscripto/, false]
  ])('%s: explica el rechazo', async (code, status, message, canRetry) => {
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockRejectedValue(apiError(status, code, 'texto del servidor'))
    const { result } = await renderHook(() => useCheckIn('p1'))

    let ok
    await act(async () => { ok = await result.current.submit({ qrToken: 'p1.abc' }) })

    expect(ok).toBe(false)
    expect(result.current.error).toMatchObject({ code, message: expect.stringMatching(message), requestId: 'r1', canRetry })
  })

  it('OUT_OF_RANGE usa el mensaje del servidor (distingue "lejos" de "GPS impreciso")', async () => {
    getPreciseLocation.mockResolvedValue(HERE)
    checkIn.mockRejectedValue(apiError(403, 'OUT_OF_RANGE', 'Estás demasiado lejos del lugar del plan'))
    const { result } = await renderHook(() => useCheckIn('p1'))

    await act(async () => { await result.current.submit({ qrToken: 'p1.abc' }) })

    expect(result.current.error).toMatchObject({ message: 'Estás demasiado lejos del lugar del plan', canRetry: true })
  })

  it('reset vuelve al estado inicial para escanear de nuevo', async () => {
    getPreciseLocation.mockResolvedValue({ status: LOCATION_STATUS.DENIED })
    const { result } = await renderHook(() => useCheckIn('p1'))
    await act(async () => { await result.current.submit({ qrToken: 'p1.abc' }) })

    await act(async () => result.current.reset())

    expect(result.current).toMatchObject({ status: CHECK_IN_STATUS.IDLE, error: null })
  })
})

describe('useMyPlans (lista paginada)', () => {
  const page = (ids, nextCursor = null) => ({ items: ids.map((id) => ({ id })), nextCursor })

  it('pide la primera página y carga más con el cursor', async () => {
    listMyPlans.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockResolvedValueOnce(page(['b', 'c']))
    const { result } = await renderHook(() => useMyPlans({ role: 'joined', when: 'upcoming' }))
    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.READY))
    expect(result.current).toMatchObject({ hasMore: true })

    await act(async () => { await result.current.loadMore() })

    // Sin repetidos aunque el servidor devuelva uno que ya estaba.
    expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.hasMore).toBe(false)
    expect(listMyPlans.mock.calls).toEqual([[{ role: 'joined', when: 'upcoming', limit: 20 }], [{ role: 'joined', when: 'upcoming', limit: 20, cursor: 'c1' }]])
  })

  it('al cambiar role o when vuelve a pedir desde el principio', async () => {
    listMyPlans.mockResolvedValue(page(['a']))
    const { result, rerender } = await renderHook((props) => useMyPlans(props), { initialProps: { role: 'joined', when: 'upcoming' } })
    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.READY))

    await rerender({ role: 'created', when: 'past' })

    await waitFor(() => expect(listMyPlans).toHaveBeenLastCalledWith({ role: 'created', when: 'past', limit: 20 }))
  })

  it('si falla la primera página queda en error y retry la vuelve a pedir', async () => {
    listMyPlans.mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)).mockResolvedValueOnce(page(['a']))
    const { result } = await renderHook(() => useMyPlans({ role: 'joined', when: 'upcoming' }))
    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.ERROR))

    await act(async () => { await result.current.retry() })

    expect(result.current).toMatchObject({ status: LIST_STATUS.READY, error: null })
  })

  it('si falla un refresco o "cargar más" conserva lo que ya se veía', async () => {
    listMyPlans
      .mockResolvedValueOnce(page(['a'], 'c1'))
      .mockRejectedValueOnce(apiError(500, 'INTERNAL'))
      .mockRejectedValueOnce(apiError(500, 'INTERNAL'))
    const { result } = await renderHook(() => useMyPlans({ role: 'joined', when: 'upcoming' }))
    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.READY))

    await act(async () => { await result.current.loadMore() })
    expect(result.current).toMatchObject({ status: LIST_STATUS.READY, loadMoreError: { code: 'INTERNAL' }, isLoadingMore: false })

    await act(async () => { await result.current.refresh() })
    expect(result.current.items).toEqual([{ id: 'a' }])
    // Un refresco fallido no se confunde con "cargar más": tiene su propio error, con el contrato completo.
    expect(result.current).toMatchObject({ isRefreshing: false, loadMoreError: null })
    expect(result.current.refreshError).toEqual({ code: 'INTERNAL', message: expect.any(String), requestId: 'r1' })

    // Al empezar otro refresco se limpia.
    listMyPlans.mockResolvedValueOnce(page(['a', 'b']))
    await act(async () => { await result.current.refresh() })
    expect(result.current.refreshError).toBeNull()
    expect(result.current.items).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('sin más páginas, loadMore no pide nada', async () => {
    listMyPlans.mockResolvedValue(page(['a']))
    const { result } = await renderHook(() => useMyPlans({ role: 'joined', when: 'upcoming' }))
    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.READY))

    await act(async () => { await result.current.loadMore() })

    expect(listMyPlans).toHaveBeenCalledTimes(1)
  })
})

describe('useParticipants', () => {
  it('no pide nada si el usuario no puede ver la lista, y la pide cuando puede', async () => {
    listParticipants.mockResolvedValue({ items: [{ id: 'u1' }], nextCursor: null })
    const { result, rerender } = await renderHook((props) => useParticipants('p1', props), { initialProps: { enabled: false } })
    expect(result.current.status).toBe(LIST_STATUS.IDLE)
    expect(listParticipants).not.toHaveBeenCalled()

    await rerender({ enabled: true })

    await waitFor(() => expect(result.current.status).toBe(LIST_STATUS.READY))
    expect(listParticipants).toHaveBeenCalledWith('p1', { limit: 20 })
  })

  it('cuando cambia la versión (alguien se anotó o se bajó) la pide de nuevo', async () => {
    listParticipants.mockResolvedValue({ items: [], nextCursor: null })
    const { rerender } = await renderHook((props) => useParticipants('p1', props), { initialProps: { enabled: true, version: 0 } })
    await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(1))

    await rerender({ enabled: true, version: 1 })

    await waitFor(() => expect(listParticipants).toHaveBeenCalledTimes(2))
  })
})

describe('useMyStats', () => {
  it('arranca con lo que tenía la sesión y se actualiza con GET /users/me', async () => {
    const response = deferred()
    getMe.mockReturnValue(response.promise)
    const { result } = await renderHook(() => useMyStats({ reputation: 2 }))
    expect(result.current).toMatchObject({ reputation: 2, noShowCount: null })

    await act(async () => response.resolve({ reputation: 3, noShowCount: 1 }))

    expect(result.current).toMatchObject({ reputation: 3, noShowCount: 1 })
  })

  it('si falla se queda con lo último conocido (y lo loguea en desarrollo); reload lo vuelve a pedir', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    getMe.mockRejectedValueOnce(apiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR)).mockResolvedValueOnce({ reputation: 5, noShowCount: 0 })
    const { result } = await renderHook(() => useMyStats({ reputation: 2 }))
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1))
    expect(result.current.reputation).toBe(2)
    // Solo `code` y `requestId`: nunca el body ni datos del usuario.
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.any(String), { code: CLIENT_ERROR_CODES.NETWORK_ERROR, requestId: 'r1' }))
    warn.mockRestore()

    await act(async () => result.current.reload())

    await waitFor(() => expect(result.current).toMatchObject({ reputation: 5, noShowCount: 0 }))
  })
})
