import { act, renderHook, waitFor } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getHealth } from '../services/api/health.js'
import { HEALTH_VIEW_STATUS, useHealth } from './useHealth.js'

jest.mock('../services/api/health.js', () => ({
  ...jest.requireActual('../services/api/health.js'),
  getHealth: jest.fn()
}))

describe('useHealth', () => {
  beforeEach(() => {
    getHealth.mockReset()
  })

  it('arranca en loading y pasa a ok', async () => {
    const pending = deferred()
    getHealth.mockReturnValueOnce(pending.promise)

    const { result } = await renderHook(() => useHealth())
    expect(result.current.status).toBe(HEALTH_VIEW_STATUS.LOADING)

    await act(async () => pending.resolve({ status: 'ok', requestId: 'req-ok' }))

    expect(result.current).toMatchObject({ status: HEALTH_VIEW_STATUS.OK, requestId: 'req-ok', error: null })
  })

  it('503 → degraded', async () => {
    const error = new ApiError({ status: 503, code: 'INTERNAL', requestId: 'req-503' })
    getHealth.mockResolvedValueOnce({ status: 'degraded', requestId: 'req-503', error })

    const { result } = await renderHook(() => useHealth())

    await waitFor(() => expect(result.current.status).toBe(HEALTH_VIEW_STATUS.DEGRADED))
    expect(result.current.requestId).toBe('req-503')
  })

  it('un ApiError → error con code y requestId', async () => {
    getHealth.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL', message: 'Falla', requestId: 'req-500' }))

    const { result } = await renderHook(() => useHealth())

    await waitFor(() => expect(result.current.status).toBe(HEALTH_VIEW_STATUS.ERROR))
    expect(result.current.error).toMatchObject({ code: 'INTERNAL', message: 'Falla' })
    expect(result.current.requestId).toBe('req-500')
  })

  it('un error que no es ApiError se normaliza (sin exponer su mensaje)', async () => {
    getHealth.mockRejectedValueOnce(new Error('Falta extra.apiUrl'))

    const { result } = await renderHook(() => useHealth())

    await waitFor(() => expect(result.current.status).toBe(HEALTH_VIEW_STATUS.ERROR))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error.code).toBe(CLIENT_ERROR_CODES.UNKNOWN_ERROR)
  })

  it('retry vuelve a loading y consulta de nuevo', async () => {
    getHealth
      .mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
    const second = deferred()
    getHealth.mockReturnValueOnce(second.promise)

    const { result } = await renderHook(() => useHealth())
    await waitFor(() => expect(result.current.status).toBe(HEALTH_VIEW_STATUS.ERROR))

    await act(async () => result.current.retry())
    expect(result.current.status).toBe(HEALTH_VIEW_STATUS.LOADING)
    expect(getHealth).toHaveBeenCalledTimes(2)

    await act(async () => second.resolve({ status: 'ok', requestId: null }))
    expect(result.current.status).toBe(HEALTH_VIEW_STATUS.OK)
  })

  it('aborta la request al desmontar y no actualiza estado', async () => {
    const pending = deferred()
    getHealth.mockReturnValueOnce(pending.promise)

    const { result, unmount } = await renderHook(() => useHealth())
    const { signal } = getHealth.mock.calls[0][0]

    await unmount()
    expect(signal.aborted).toBe(true)

    await act(async () => pending.resolve({ status: 'ok', requestId: 'tarde' }))
    expect(result.current.status).toBe(HEALTH_VIEW_STATUS.LOADING)
  })
})
