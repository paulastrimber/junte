import { act, renderHook } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { findAddress, getCurrentCoordinates } from '../services/location.js'
import { PLACE_MESSAGES, usePlacePicker } from './usePlacePicker.js'

jest.mock('../services/location.js', () => ({
  ...jest.requireActual('../services/location.js'),
  findAddress: jest.fn(),
  getCurrentCoordinates: jest.fn()
}))

async function setup () {
  const onPick = jest.fn()
  const view = await renderHook(() => usePlacePicker(onPick))
  return { ...view, onPick }
}

describe('usePlacePicker', () => {
  beforeEach(() => {
    findAddress.mockReset()
    getCurrentCoordinates.mockReset()
  })

  it('buscar una dirección entrega el punto encontrado como [lng, lat]', async () => {
    findAddress.mockResolvedValue([-56.166, -34.913])
    const { result, onPick } = await setup()

    await act(async () => result.current.setAddress('Parque Rodó'))
    await act(async () => result.current.searchAddress())

    expect(findAddress).toHaveBeenCalledWith('Parque Rodó')
    expect(onPick).toHaveBeenCalledWith([-56.166, -34.913])
    expect(result.current.message).toBeNull()
  })

  it('si no encuentra la dirección avisa y no mueve el pin', async () => {
    findAddress.mockResolvedValue(null)
    const { result, onPick } = await setup()

    await act(async () => result.current.setAddress('calle inexistente 999'))
    await act(async () => result.current.searchAddress())

    expect(onPick).not.toHaveBeenCalled()
    expect(result.current.message).toBe(PLACE_MESSAGES.notFound)
  })

  it('con el buscador vacío no busca ni muestra un aviso', async () => {
    const { result } = await setup()

    await act(async () => result.current.searchAddress())

    expect(findAddress).not.toHaveBeenCalled()
    expect(result.current.message).toBeNull()
  })

  it('"usar mi ubicación" entrega la posición actual', async () => {
    getCurrentCoordinates.mockResolvedValue({ status: 'granted', coordinates: [-56.1645, -34.9011] })
    const { result, onPick } = await setup()

    await act(async () => result.current.pickMyLocation())

    expect(onPick).toHaveBeenCalledWith([-56.1645, -34.9011])
  })

  it.each([
    ['denied', PLACE_MESSAGES.denied],
    ['unavailable', PLACE_MESSAGES.unavailable]
  ])('sin ubicación (%s) explica qué pasó y deja seguir con el mapa', async (status, message) => {
    getCurrentCoordinates.mockResolvedValue({ status, coordinates: null })
    const { result, onPick } = await setup()

    await act(async () => result.current.pickMyLocation())

    expect(onPick).not.toHaveBeenCalled()
    expect(result.current.message).toBe(message)
  })

  it('mientras busca marca isWorking y no lanza otra búsqueda', async () => {
    const pending = deferred()
    getCurrentCoordinates.mockReturnValue(pending.promise)
    const { result } = await setup()

    await act(async () => { result.current.pickMyLocation() })
    expect(result.current.isWorking).toBe(true)
    await act(async () => { result.current.pickMyLocation() })
    await act(async () => pending.resolve({ status: 'granted', coordinates: [1, 2] }))

    expect(getCurrentCoordinates).toHaveBeenCalledTimes(1)
    expect(result.current.isWorking).toBe(false)
  })

  it('una búsqueda nueva borra el aviso anterior', async () => {
    findAddress.mockResolvedValueOnce(null).mockResolvedValueOnce([1, 2])
    const { result } = await setup()
    await act(async () => result.current.setAddress('algo'))

    await act(async () => result.current.searchAddress())
    expect(result.current.message).toBe(PLACE_MESSAGES.notFound)
    await act(async () => result.current.searchAddress())

    expect(result.current.message).toBeNull()
  })
})
