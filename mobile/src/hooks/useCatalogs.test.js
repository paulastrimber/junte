import { renderHook, waitFor, act } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { CATALOG } from '../../tests/helpers/auth.jsx'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { CATALOG_STATUS, resetCatalogsCache, useCatalogs } from './useCatalogs.js'

jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))

describe('useCatalogs', () => {
  beforeEach(() => {
    resetCatalogsCache()
    getCatalogs.mockReset()
  })

  it('arranca cargando y después entrega el catálogo', async () => {
    const pending = deferred()
    getCatalogs.mockReturnValue(pending.promise)

    const { result } = await renderHook(() => useCatalogs())
    expect(result.current.status).toBe(CATALOG_STATUS.LOADING)
    expect(result.current.catalog).toBeNull()

    await act(async () => pending.resolve(CATALOG))

    expect(result.current.status).toBe(CATALOG_STATUS.READY)
    expect(result.current.catalog).toBe(CATALOG)
  })

  it('los catálogos se piden una sola vez aunque varias pantallas los usen', async () => {
    getCatalogs.mockResolvedValue(CATALOG)

    const first = await renderHook(() => useCatalogs())
    await waitFor(() => expect(first.result.current.status).toBe(CATALOG_STATUS.READY))
    const second = await renderHook(() => useCatalogs())

    expect(second.result.current.status).toBe(CATALOG_STATUS.READY) // desde la caché, sin pasar por "cargando"
    expect(getCatalogs).toHaveBeenCalledTimes(1)
  })

  it('dos usos simultáneos comparten la misma request', async () => {
    const pending = deferred()
    getCatalogs.mockReturnValue(pending.promise)

    await renderHook(() => useCatalogs())
    await renderHook(() => useCatalogs())
    await act(async () => pending.resolve(CATALOG))

    expect(getCatalogs).toHaveBeenCalledTimes(1)
  })

  it('si falla muestra el error y "retry" lo vuelve a intentar', async () => {
    const error = new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    getCatalogs.mockRejectedValueOnce(error).mockResolvedValueOnce(CATALOG)

    const { result } = await renderHook(() => useCatalogs())
    await waitFor(() => expect(result.current.status).toBe(CATALOG_STATUS.ERROR))
    expect(result.current.error).toBe(error)

    await act(async () => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe(CATALOG_STATUS.READY))
    expect(getCatalogs).toHaveBeenCalledTimes(2)
  })

  it('un error no se queda guardado en la caché', async () => {
    getCatalogs.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' })).mockResolvedValueOnce(CATALOG)
    const first = await renderHook(() => useCatalogs())
    await waitFor(() => expect(first.result.current.status).toBe(CATALOG_STATUS.ERROR))

    const second = await renderHook(() => useCatalogs())

    await waitFor(() => expect(second.result.current.status).toBe(CATALOG_STATUS.READY))
  })
})
