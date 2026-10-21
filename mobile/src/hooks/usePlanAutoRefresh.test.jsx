import { useKeepAwake } from 'expo-keep-awake'
import { act, render, renderHook, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { createPlanQr } from '../services/api/checkins.js'
import PlanQrScreen from '../screens/PlanQrScreen.jsx'
import { nextPlanMilestone } from '../utils/attendance.js'
import { usePlanAutoRefresh } from './usePlanAutoRefresh.js'

jest.mock('../services/api/checkins.js', () => ({ checkIn: jest.fn(), createPlanQr: jest.fn() }))

const NOW = new Date('2026-10-25T20:00:00.000Z')
const MINUTE_MS = 60 * 1000
const at = (minutes) => new Date(NOW.getTime() + minutes * MINUTE_MS).toISOString()

/** Un plan que empieza `startsIn` minutos después de NOW y dura dos horas. */
const plan = ({ startsIn = 60, ...overrides } = {}) => ({
  id: 'p1',
  status: 'open',
  startsAt: at(startsIn),
  endsAt: at(startsIn + 120),
  checkInOpensAt: at(startsIn - 15),
  checkInClosesAt: at(startsIn + 60),
  ...overrides
})

describe('nextPlanMilestone', () => {
  it('devuelve el próximo momento que cambia lo que se puede hacer, en orden', () => {
    expect(nextPlanMilestone(plan(), NOW)).toEqual(new Date(at(45))) // abre el horario de asistencia
    expect(nextPlanMilestone(plan({ startsIn: 10 }), NOW)).toEqual(new Date(at(10))) // empieza
    expect(nextPlanMilestone(plan({ startsIn: -10 }), NOW)).toEqual(new Date(at(50))) // cierra el horario
    expect(nextPlanMilestone(plan({ startsIn: -90 }), NOW)).toEqual(new Date(at(30))) // termina
  })

  it('null si el plan ya terminó o está cancelado o completado', () => {
    expect(nextPlanMilestone(plan({ startsIn: -180 }), NOW)).toBeNull()
    expect(nextPlanMilestone(plan({ status: 'cancelled' }), NOW)).toBeNull()
    expect(nextPlanMilestone(plan({ status: 'completed' }), NOW)).toBeNull()
  })
})

describe('usePlanAutoRefresh', () => {
  let appStateListener
  let removeAppStateListener

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW })
    removeAppStateListener = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener
      return { remove: removeAppStateListener }
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('refresca solo cuando abre el horario de asistencia (ni antes ni varias veces)', async () => {
    const refresh = jest.fn()
    await renderHook(() => usePlanAutoRefresh(plan(), refresh))

    await act(async () => jest.advanceTimersByTime(45 * MINUTE_MS - 1))
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => jest.advanceTimersByTime(2_000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('con cada plan nuevo programa el momento siguiente', async () => {
    const refresh = jest.fn()
    const current = plan()
    const { rerender } = await renderHook((props) => usePlanAutoRefresh(props.plan, refresh), { initialProps: { plan: current } })
    await act(async () => jest.advanceTimersByTime(46 * MINUTE_MS))
    expect(refresh).toHaveBeenCalledTimes(1)

    // Llegó el plan refrescado: el próximo momento es el comienzo (minuto 60).
    await rerender({ plan: { ...current } })
    await act(async () => jest.advanceTimersByTime(15 * MINUTE_MS))

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('refresca cuando la app vuelve a primer plano, y no cuando pasa a segundo plano', async () => {
    const refresh = jest.fn()
    await renderHook(() => usePlanAutoRefresh(plan(), refresh))

    await act(async () => appStateListener('background'))
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => appStateListener('active'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('un "inactive" (centro de control, diálogo de permisos) que vuelve a "active" no refresca', async () => {
    const refresh = jest.fn()
    await renderHook(() => usePlanAutoRefresh(plan(), refresh))

    await act(async () => appStateListener('inactive'))
    await act(async () => appStateListener('active'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('con la pantalla fuera de foco no refresca al volver a primer plano (lo hará al volver a ella)', async () => {
    const refresh = jest.fn()
    const onForeground = jest.fn()
    const { rerender } = await renderHook((props) => usePlanAutoRefresh(plan(), refresh, props), { initialProps: { isFocused: false, onForeground } })

    await act(async () => appStateListener('background'))
    await act(async () => appStateListener('active'))
    expect(onForeground).not.toHaveBeenCalled()

    await rerender({ isFocused: true, onForeground })
    await act(async () => appStateListener('background'))
    await act(async () => appStateListener('active'))
    expect(onForeground).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('al salir de la pantalla deja de escuchar y cancela lo programado', async () => {
    const refresh = jest.fn()
    const { unmount } = await renderHook(() => usePlanAutoRefresh(plan(), refresh))

    await unmount()
    await act(async () => jest.advanceTimersByTime(24 * 60 * MINUTE_MS))

    expect(refresh).not.toHaveBeenCalled()
    expect(removeAppStateListener).toHaveBeenCalledTimes(1)
  })

  it('sin plan (cargando), con el plan terminado o con el próximo momento a más de un día no programa nada', async () => {
    const refresh = jest.fn()
    const { rerender } = await renderHook((props) => usePlanAutoRefresh(props.plan, refresh), { initialProps: { plan: null } })
    await rerender({ plan: plan({ status: 'cancelled' }) })
    await rerender({ plan: plan({ startsIn: 3 * 24 * 60 }) })

    await act(async () => jest.advanceTimersByTime(23 * 60 * MINUTE_MS))

    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('PlanQrScreen: pantalla encendida', () => {
  it('mantiene la pantalla encendida mientras se muestra el QR', async () => {
    useKeepAwake.mockClear()
    createPlanQr.mockResolvedValue({ qrToken: 'p1.token', expiresAt: new Date(Date.now() + 90_000).toISOString() })

    const view = await render(<PlanQrScreen navigation={{ goBack: jest.fn() }} route={{ params: { planId: 'p1' } }} />)
    await screen.findByLabelText('p1.token')

    expect(useKeepAwake).toHaveBeenCalled()
    await view.unmount()
  })
})
