import { act, renderHook, waitFor } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, USER } from '../../tests/helpers/auth.jsx'
import { getPlanFilters } from '../services/api/plans.js'
import { useAuth } from './useAuth.js'
import { CATALOG_STATUS, useCatalogs } from './useCatalogs.js'
import { resetFilterOptionsCache, toApiFilters, useFeedFilters } from './useFeedFilters.js'

jest.mock('../services/api/plans.js', () => ({ getPlanFilters: jest.fn() }))
jest.mock('./useAuth.js', () => ({ useAuth: jest.fn() }))
jest.mock('./useCatalogs.js', () => ({ ...jest.requireActual('./useCatalogs.js'), useCatalogs: jest.fn() }))

const PRICE_RANGES = [{ key: 'free', min: 0, max: 0 }, { key: 'low', min: 1, max: 500 }]
const OPTIONS = { priceRanges: PRICE_RANGES, radiusKm: { min: 0.5, max: 50, default: 10 } }

describe('useFeedFilters', () => {
  beforeEach(() => {
    resetFilterOptionsCache()
    getPlanFilters.mockReset()
    getPlanFilters.mockResolvedValue(OPTIONS)
    useAuth.mockReturnValue({ user: COMPLETE_USER })
    useCatalogs.mockReturnValue({ status: CATALOG_STATUS.READY, catalog: CATALOG })
  })

  it('arranca con planes con cupo, radio de 10 km y sin filtros', async () => {
    const { result } = await renderHook(() => useFeedFilters())

    expect(result.current.values).toEqual({ availability: 'available', radiusKm: 10, datePreset: 'any', interests: [], priceRanges: [] })
    expect(result.current.query).toEqual({ availability: 'available', datePreset: 'any' })
    expect(result.current.radiusKm).toBe(10)
    expect(result.current.activeCount).toBe(0)
  })

  it('los rangos de precio vienen del back y se piden una sola vez por sesión', async () => {
    const first = await renderHook(() => useFeedFilters())
    await waitFor(() => expect(first.result.current.priceRangeOptions).toEqual(PRICE_RANGES))

    const second = await renderHook(() => useFeedFilters())

    expect(second.result.current.priceRangeOptions).toEqual(PRICE_RANGES)
    expect(getPlanFilters).toHaveBeenCalledTimes(1)
  })

  it('si no se pueden cargar los rangos, el filtro de precio queda sin opciones (el feed sigue)', async () => {
    getPlanFilters.mockRejectedValue(new Error('sin red'))

    const { result } = await renderHook(() => useFeedFilters())
    await act(async () => {})

    expect(result.current.priceRangeOptions).toEqual([])
  })

  it('los tipos de actividad salen del catálogo, sin las opciones para mayores si no tiene la edad', async () => {
    const adult = await renderHook(() => useFeedFilters())
    useAuth.mockReturnValue({ user: USER })
    const noAge = await renderHook(() => useFeedFilters())
    const keys = (result) => result.current.interestCategories.flatMap((category) => category.interests).map((interest) => interest.key)

    expect(keys(adult.result)).toEqual(expect.arrayContaining(['futbol', 'cine', 'bares']))
    expect(keys(noAge.result)).not.toContain('bares')
  })

  it('se pueden elegir varios rangos de precio y varios intereses a la vez; tocar de nuevo los quita', async () => {
    const { result } = await renderHook(() => useFeedFilters())

    await act(async () => result.current.togglePriceRange('free'))
    await act(async () => result.current.togglePriceRange('low'))
    await act(async () => result.current.toggleInterest('futbol'))
    await act(async () => result.current.toggleInterest('cine'))
    expect(result.current.query).toEqual({ availability: 'available', datePreset: 'any', priceRanges: ['free', 'low'], interests: ['futbol', 'cine'] })

    await act(async () => result.current.togglePriceRange('free'))
    await act(async () => result.current.toggleInterest('futbol'))
    expect(result.current.query).toMatchObject({ priceRanges: ['low'], interests: ['cine'] })
  })

  it('el radio no forma parte de los filtros de la consulta (solo se usa con ubicación) pero cuenta como filtro activo', async () => {
    const { result } = await renderHook(() => useFeedFilters())

    await act(async () => result.current.setValue('radiusKm', 2))
    await act(async () => result.current.setValue('datePreset', 'week'))

    expect(result.current.radiusKm).toBe(2)
    expect(result.current.query).toEqual({ availability: 'available', datePreset: 'week' })
    expect(result.current.activeCount).toBe(2)
  })

  it('"limpiar" vuelve a los valores iniciales pero conserva la sección (con cupo / llenos)', async () => {
    const { result } = await renderHook(() => useFeedFilters())
    await act(async () => result.current.setValue('availability', 'full'))
    await act(async () => result.current.setValue('radiusKm', 50))
    await act(async () => result.current.togglePriceRange('free'))

    await act(async () => result.current.reset())

    expect(result.current.values).toEqual({ availability: 'full', radiusKm: 10, datePreset: 'any', interests: [], priceRanges: [] })
  })

  it('`query` no cambia de identidad si no cambian los filtros (no dispara recargas)', async () => {
    const { result, rerender } = await renderHook(() => useFeedFilters())
    const before = result.current.query

    await rerender()

    expect(result.current.query).toBe(before)
  })
})

describe('toApiFilters', () => {
  const NOW = new Date(2026, 9, 12, 12)

  it('quita datePreset y agrega "to" según el filtro de fecha', () => {
    expect(toApiFilters({ availability: 'available', datePreset: 'any', interests: ['cine'] }, NOW)).toEqual({ availability: 'available', interests: ['cine'] })
    expect(toApiFilters({ availability: 'full', datePreset: 'week' }, NOW)).toEqual({
      availability: 'full', to: new Date(NOW.getTime() + 7 * 86_400_000).toISOString()
    })
  })
})
