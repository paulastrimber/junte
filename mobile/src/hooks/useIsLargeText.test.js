import { act, renderHook } from '@testing-library/react-native'
import { Dimensions } from 'react-native'

import { LARGE_TEXT_SCALE } from '../theme/index.js'
import { useIsLargeText } from './useIsLargeText.js'

let fontScale
let listeners

beforeEach(() => {
  fontScale = 1
  listeners = new Set()
  const window = Dimensions.get('window')
  jest.spyOn(Dimensions, 'get').mockImplementation(() => ({ ...window, fontScale }))
  jest.spyOn(Dimensions, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener)
    return { remove: () => listeners.delete(listener) }
  })
})
afterEach(() => jest.restoreAllMocks())

const changeFontScale = async (value) => act(async () => {
  fontScale = value
  for (const listener of listeners) listener({ window: Dimensions.get('window') })
})

describe('useIsLargeText', () => {
  it.each([[1, false], [1.29, false], [LARGE_TEXT_SCALE, true], [2, true]])('fontScale %p → %p', async (value, expected) => {
    fontScale = value
    const { result } = await renderHook(() => useIsLargeText())

    expect(result.current).toBe(expected)
  })

  it('cambia cuando el usuario agranda o achica el texto del sistema', async () => {
    const { result } = await renderHook(() => useIsLargeText())
    expect(result.current).toBe(false)

    await changeFontScale(2)
    expect(result.current).toBe(true)

    await changeFontScale(1)
    expect(result.current).toBe(false)
  })

  it('solo vuelve a renderizar cuando cruza el umbral, no con cada cambio de la ventana', async () => {
    let renders = 0
    await renderHook(() => { renders++; return useIsLargeText() })
    const initial = renders

    await changeFontScale(1.1)
    await changeFontScale(1.2)
    expect(renders).toBe(initial)

    await changeFontScale(1.5)
    expect(renders).toBe(initial + 1)
  })

  it('se desuscribe al desmontar', async () => {
    const { unmount } = await renderHook(() => useIsLargeText())
    expect(listeners.size).toBe(1)

    await unmount()

    expect(listeners.size).toBe(0)
  })
})
