import { act, renderHook, waitFor } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { getFeed } from '../services/api/feed.js'
import { listPlans } from '../services/api/plans.js'
import { readBusySlots } from '../services/calendar.js'
import { getCurrentCoordinates } from '../services/location.js'
import { FEED_MODE, FEED_STATUS, useFeed } from './useFeed.js'

jest.mock('../services/api/feed.js', () => ({ getFeed: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ listPlans: jest.fn() }))
jest.mock('../services/calendar.js', () => ({ readBusySlots: jest.fn() }))
jest.mock('../services/location.js', () => ({
  ...jest.requireActual('../services/location.js'),
  getCurrentCoordinates: jest.fn()
}))

const NEAR = [-56.1645, -34.9011]
const CALENDAR = { from: '2026-10-12T15:00:00.000Z', to: '2026-11-11T15:00:00.000Z', busy: [] }
const QUERY = Object.freeze({ availability: 'available', datePreset: 'any' })
const plan = (id) => ({ id, title: `Plan ${id}` })
const page = (ids, nextCursor = null) => ({ items: ids.map(plan), nextCursor })
const ids = (result) => result.current.items.map((item) => item.id)

const withLocation = () => getCurrentCoordinates.mockResolvedValue({ status: 'granted', coordinates: NEAR })
const withoutLocation = (status = 'denied') => getCurrentCoordinates.mockResolvedValue({ status, coordinates: null })

async function renderFeed (props = { query: QUERY, radiusKm: 10 }) {
  const view = await renderHook((current) => useFeed(current), { initialProps: props })
  return view
}

describe('useFeed', () => {
  beforeEach(() => {
    getFeed.mockReset()
    listPlans.mockReset()
    readBusySlots.mockReset()
    getCurrentCoordinates.mockReset()
    readBusySlots.mockResolvedValue(null)
  })

  describe('primera página', () => {
    it('arranca cargando y, con ubicación y calendario, consulta POST /feed con ambos', async () => {
      withLocation()
      readBusySlots.mockResolvedValue(CALENDAR)
      const pending = deferred()
      getFeed.mockReturnValueOnce(pending.promise)

      const { result } = await renderFeed({ query: { ...QUERY, interests: ['futbol'] }, radiusKm: 5 })
      expect(result.current.status).toBe(FEED_STATUS.LOADING)

      await act(async () => pending.resolve(page(['a', 'b'], 'cursor-1')))

      expect(getFeed).toHaveBeenCalledWith({ availability: 'available', interests: ['futbol'], near: NEAR, radiusKm: 5, limit: 20, calendar: CALENDAR })
      expect(result.current).toMatchObject({ status: FEED_STATUS.READY, mode: FEED_MODE.NEARBY, hasMore: true, locationStatus: 'granted' })
      expect(ids(result)).toEqual(['a', 'b'])
      expect(listPlans).not.toHaveBeenCalled()
    })

    it('sin permiso de calendario no se envía nada del calendario', async () => {
      withLocation()
      readBusySlots.mockResolvedValue(null)
      getFeed.mockResolvedValue(page(['a']))

      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      expect(getFeed.mock.calls[0][0]).not.toHaveProperty('calendar')
    })

    it.each(['denied', 'unavailable'])('sin ubicación (%s) degrada a GET /plans por fecha, sin near ni radio, y no lee el calendario', async (status) => {
      withoutLocation(status)
      listPlans.mockResolvedValue(page(['a']))

      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      expect(listPlans).toHaveBeenCalledWith({ availability: 'available', limit: 20 })
      expect(result.current).toMatchObject({ mode: FEED_MODE.BY_DATE, locationStatus: status, hasMore: false })
      expect(getFeed).not.toHaveBeenCalled()
      expect(readBusySlots).not.toHaveBeenCalled()
    })

    it('el filtro de fecha predefinido se convierte en "to"', async () => {
      withoutLocation()
      listPlans.mockResolvedValue(page([]))

      const { result } = await renderFeed({ query: { ...QUERY, datePreset: 'week' }, radiusKm: 10 })
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      expect(listPlans.mock.calls[0][0]).toEqual({ availability: 'available', limit: 20, to: expect.any(String) })
    })

    it('sin planes queda listo y vacío (estado "vacío")', async () => {
      withoutLocation()
      listPlans.mockResolvedValue(page([]))

      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      expect(result.current.items).toEqual([])
      expect(result.current.hasMore).toBe(false)
    })

    it('si falla queda en error con el ApiError, y retry vuelve a cargar', async () => {
      withoutLocation()
      listPlans.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })).mockResolvedValueOnce(page(['a']))

      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.ERROR))
      expect(result.current.error).toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })

      await act(async () => result.current.retry())

      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))
      expect(ids(result)).toEqual(['a'])
    })
  })

  describe('scroll infinito', () => {
    it('loadMore pide la página siguiente con el cursor y la MISMA consulta, y agrega los planes', async () => {
      withLocation()
      readBusySlots.mockResolvedValue(CALENDAR)
      getFeed.mockResolvedValueOnce(page(['a', 'b'], 'cursor-1')).mockResolvedValueOnce(page(['c'], null))
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => result.current.loadMore())

      expect(getFeed).toHaveBeenLastCalledWith({ availability: 'available', near: NEAR, radiusKm: 10, limit: 20, calendar: CALENDAR, cursor: 'cursor-1' })
      expect(ids(result)).toEqual(['a', 'b', 'c'])
      expect(result.current.hasMore).toBe(false)
      // La ubicación y el calendario se leen una sola vez por recorrido.
      expect(getCurrentCoordinates).toHaveBeenCalledTimes(1)
      expect(readBusySlots).toHaveBeenCalledTimes(1)
    })

    it('sin nextCursor no pide nada', async () => {
      withoutLocation()
      listPlans.mockResolvedValue(page(['a']))
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => result.current.loadMore())

      expect(listPlans).toHaveBeenCalledTimes(1)
    })

    it('dos loadMore seguidos (onEndReached repetido) hacen una sola request', async () => {
      withoutLocation()
      const second = deferred()
      listPlans.mockResolvedValueOnce(page(['a'], 'cursor-1')).mockReturnValueOnce(second.promise)
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => { result.current.loadMore() })
      expect(result.current.isLoadingMore).toBe(true)
      await act(async () => { result.current.loadMore() })
      await act(async () => second.resolve(page(['b'])))

      expect(listPlans).toHaveBeenCalledTimes(2)
      expect(ids(result)).toEqual(['a', 'b'])
    })

    it('nunca repite un plan aunque el servidor lo mande dos veces', async () => {
      withoutLocation()
      listPlans.mockResolvedValueOnce(page(['a', 'b'], 'cursor-1')).mockResolvedValueOnce(page(['b', 'c']))
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => result.current.loadMore())

      expect(ids(result)).toEqual(['a', 'b', 'c'])
    })

    it('si falla cargar más, conserva lo que había y permite reintentar', async () => {
      withoutLocation()
      listPlans
        .mockResolvedValueOnce(page(['a'], 'cursor-1'))
        .mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL' }))
        .mockResolvedValueOnce(page(['b']))
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => result.current.loadMore())
      expect(result.current).toMatchObject({ status: FEED_STATUS.READY, isLoadingMore: false, hasMore: true })
      expect(result.current.loadMoreError).toMatchObject({ code: 'INTERNAL' })
      expect(ids(result)).toEqual(['a'])

      await act(async () => result.current.loadMore())
      expect(ids(result)).toEqual(['a', 'b'])
      expect(result.current.loadMoreError).toBeNull()
    })
  })

  describe('pull-to-refresh', () => {
    it('refresh marca isRefreshing, conserva la lista mientras tanto y la reemplaza al terminar', async () => {
      withoutLocation()
      const again = deferred()
      listPlans.mockResolvedValueOnce(page(['a', 'b'], 'cursor-1')).mockReturnValueOnce(again.promise)
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => { result.current.refresh() })
      expect(result.current.isRefreshing).toBe(true)
      expect(ids(result)).toEqual(['a', 'b'])

      await act(async () => again.resolve(page(['z'])))

      expect(result.current.isRefreshing).toBe(false)
      expect(ids(result)).toEqual(['z'])
      expect(listPlans).toHaveBeenLastCalledWith({ availability: 'available', limit: 20 })
    })

    it('si el refresco falla se queda con lo que ya mostraba', async () => {
      withoutLocation()
      listPlans.mockResolvedValueOnce(page(['a'])).mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      const { result } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await act(async () => result.current.refresh())

      expect(result.current).toMatchObject({ status: FEED_STATUS.READY, isRefreshing: false })
      expect(ids(result)).toEqual(['a'])
      expect(result.current.loadMoreError).toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    })
  })

  describe('cambios de filtros', () => {
    it('al cambiar un filtro o el radio vuelve a cargar desde la primera página', async () => {
      withLocation()
      getFeed.mockResolvedValueOnce(page(['a'], 'cursor-1')).mockResolvedValueOnce(page(['x'])).mockResolvedValueOnce(page(['y']))
      const { result, rerender } = await renderFeed()
      await waitFor(() => expect(ids(result)).toEqual(['a']))

      await rerender({ query: { ...QUERY, availability: 'full' }, radiusKm: 10 })
      await waitFor(() => expect(ids(result)).toEqual(['x']))
      await rerender({ query: { ...QUERY, availability: 'full' }, radiusKm: 25 })
      await waitFor(() => expect(ids(result)).toEqual(['y']))

      expect(getFeed.mock.calls[1][0]).toMatchObject({ availability: 'full', radiusKm: 10 })
      expect(getFeed.mock.calls[1][0]).not.toHaveProperty('cursor')
      expect(getFeed.mock.calls[2][0]).toMatchObject({ radiusKm: 25 })
    })

    it('un render con los mismos filtros (otro objeto, mismo contenido) no vuelve a pedir', async () => {
      withoutLocation()
      listPlans.mockResolvedValue(page(['a']))
      const { result, rerender } = await renderFeed()
      await waitFor(() => expect(result.current.status).toBe(FEED_STATUS.READY))

      await rerender({ query: { ...QUERY }, radiusKm: 10 })

      expect(listPlans).toHaveBeenCalledTimes(1)
    })

    it('descarta la respuesta de una consulta vieja que llega después de la nueva', async () => {
      withoutLocation()
      const slow = deferred()
      listPlans.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(['nuevo']))
      const { result, rerender } = await renderFeed()

      await rerender({ query: { ...QUERY, availability: 'full' }, radiusKm: 10 })
      await waitFor(() => expect(ids(result)).toEqual(['nuevo']))
      await act(async () => slow.resolve(page(['viejo'])))

      expect(ids(result)).toEqual(['nuevo'])
    })
  })

  it('al desmontar no actualiza estado con una respuesta tardía', async () => {
    withoutLocation()
    const pending = deferred()
    listPlans.mockReturnValueOnce(pending.promise)
    const { result, unmount } = await renderFeed()

    await unmount()
    await act(async () => pending.resolve(page(['tarde'])))

    expect(result.current.status).toBe(FEED_STATUS.LOADING)
  })
})
