import { act, renderHook, waitFor } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getPlan } from '../services/api/plans.js'
import { PLAN_STATUS, usePlan } from './usePlan.js'

jest.mock('../services/api/plans.js', () => ({ getPlan: jest.fn() }))

const PLAN = { id: 'p1', title: 'Partido' }

describe('usePlan', () => {
  beforeEach(() => getPlan.mockReset())

  it('arranca cargando y pasa a listo con el plan', async () => {
    const pending = deferred()
    getPlan.mockReturnValueOnce(pending.promise)

    const { result } = await renderHook(() => usePlan('p1'))
    expect(result.current).toMatchObject({ status: PLAN_STATUS.LOADING, plan: null })

    await act(async () => pending.resolve(PLAN))

    expect(result.current).toMatchObject({ status: PLAN_STATUS.READY, plan: PLAN, error: null })
    expect(getPlan).toHaveBeenCalledWith('p1', { signal: expect.any(Object) })
  })

  it('404 → "no disponible" (no existe o ya no es visible)', async () => {
    getPlan.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND' }))

    const { result } = await renderHook(() => usePlan('p1'))

    await waitFor(() => expect(result.current.status).toBe(PLAN_STATUS.NOT_FOUND))
  })

  it('otro error → error, y reload vuelve a pedirlo', async () => {
    getPlan.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(PLAN)

    const { result } = await renderHook(() => usePlan('p1'))
    await waitFor(() => expect(result.current.status).toBe(PLAN_STATUS.ERROR))
    expect(result.current.error).toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })

    await act(async () => result.current.reload())

    await waitFor(() => expect(result.current.status).toBe(PLAN_STATUS.READY))
    expect(getPlan).toHaveBeenCalledTimes(2)
  })

  it('cuando cambia la versión (se volvió de editar) lo pide otra vez', async () => {
    getPlan.mockResolvedValueOnce(PLAN).mockResolvedValueOnce({ ...PLAN, title: 'Editado' })

    const { result, rerender } = await renderHook(({ version }) => usePlan('p1', version), { initialProps: { version: 0 } })
    await waitFor(() => expect(result.current.plan).toEqual(PLAN))
    await rerender({ version: 1 })

    await waitFor(() => expect(result.current.plan.title).toBe('Editado'))
  })

  it('aborta la request al desmontar y no actualiza estado', async () => {
    const pending = deferred()
    getPlan.mockReturnValueOnce(pending.promise)
    const { result, unmount } = await renderHook(() => usePlan('p1'))
    const { signal } = getPlan.mock.calls[0][1]

    await unmount()
    expect(signal.aborted).toBe(true)

    await act(async () => pending.resolve(PLAN))
    expect(result.current.status).toBe(PLAN_STATUS.LOADING)
  })
})
