import { deferred } from '../../tests/helpers/deferred.js'
import { createPushService, planIdFromResponse } from './push.js'

const PLAN_ID = '885f1c2a9b1e8a001234567a'
const response = (data, identifier = 'n1') => ({ notification: { request: { identifier, content: { data } } } })

function setup ({ permission = { granted: true }, token = 'fcm-token-1' } = {}) {
  const listeners = {}
  const notifications = {
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => permission),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
    setNotificationChannelAsync: jest.fn(async () => null),
    getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: token })),
    addPushTokenListener: jest.fn((listener) => { listeners.token = listener; return { remove: jest.fn() } }),
    addNotificationResponseReceivedListener: jest.fn((listener) => { listeners.response = listener; return { remove: jest.fn() } }),
    getLastNotificationResponseAsync: jest.fn(async () => null)
  }
  const devices = { registerDevice: jest.fn(async () => {}), unregisterDevice: jest.fn(async () => {}) }
  const push = createPushService({ notifications, devices, platform: 'android' })
  return { push, notifications, devices, listeners }
}

describe('push.register', () => {
  it('con permiso registra el token nativo en /devices (con el canal de Android creado)', async () => {
    const { push, devices, notifications } = setup()

    expect(await push.register()).toBe('fcm-token-1')
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.any(Object))
    expect(devices.registerDevice).toHaveBeenCalledWith({ token: 'fcm-token-1', platform: 'android' })
  })

  it('pide el permiso si todavía se puede; sin permiso no registra nada', async () => {
    const { push, devices, notifications } = setup({ permission: { granted: false, canAskAgain: true } })

    expect(await push.register()).toBeNull()
    expect(notifications.requestPermissionsAsync).toHaveBeenCalled()
    expect(devices.registerDevice).not.toHaveBeenCalled()
  })

  it('si el token no se puede obtener (Expo Go, sin Firebase) no lanza', async () => {
    const { push, notifications, devices } = setup()
    notifications.getDevicePushTokenAsync.mockRejectedValue(new Error('no FCM'))

    await expect(push.register()).resolves.toBeNull()
    expect(devices.registerDevice).not.toHaveBeenCalled()
  })

  it('si FCM rota el token lo vuelve a registrar', async () => {
    const { push, devices, listeners } = setup()
    await push.register()

    listeners.token({ data: 'fcm-token-2' })

    await new Promise((resolve) => setImmediate(resolve))
    expect(devices.registerDevice).toHaveBeenLastCalledWith({ token: 'fcm-token-2', platform: 'android' })
  })
})

describe('push.unregister', () => {
  it('da de baja el token registrado; sin token no hace nada; un error de red no lanza', async () => {
    const { push, devices } = setup()
    await push.unregister()
    expect(devices.unregisterDevice).not.toHaveBeenCalled()

    await push.register()
    devices.unregisterDevice.mockRejectedValue(new Error('offline'))
    await expect(push.unregister()).resolves.toBeUndefined()
    expect(devices.unregisterDevice).toHaveBeenCalledWith('fcm-token-1')
  })
})

describe('push: logout durante un registro en curso', () => {
  it('si el logout llega mientras se obtiene el token, el registro no deja token, registro ni listener', async () => {
    const { push, devices, notifications } = setup()
    const pending = deferred()
    notifications.getDevicePushTokenAsync.mockReturnValue(pending.promise)
    const registering = push.register()
    await new Promise((resolve) => setImmediate(resolve))

    const unregistering = push.unregister()
    pending.resolve({ type: 'android', data: 'fcm-token-1' })

    expect(await registering).toBeNull()
    await unregistering
    expect(devices.registerDevice).not.toHaveBeenCalled()
    expect(notifications.addPushTokenListener).not.toHaveBeenCalled()
  })

  it('si el logout llega mientras se registra en el back, unregister espera y da de baja ese token', async () => {
    const { push, devices, notifications } = setup()
    const registered = deferred()
    devices.registerDevice.mockReturnValue(registered.promise)
    const registering = push.register()
    await new Promise((resolve) => setImmediate(resolve))

    const unregistering = push.unregister()
    registered.resolve()
    await Promise.all([registering, unregistering])

    expect(devices.unregisterDevice).toHaveBeenCalledWith('fcm-token-1')
    expect(notifications.addPushTokenListener).not.toHaveBeenCalled()
  })

  it('después de un logout se puede volver a registrar (otra cuenta)', async () => {
    const { push, devices } = setup()
    await push.register()
    await push.unregister()
    devices.registerDevice.mockClear()

    expect(await push.register()).toBe('fcm-token-1')
    expect(devices.registerDevice).toHaveBeenCalledTimes(1)
  })
})

describe('abrir el plan desde un aviso', () => {
  it('planIdFromResponse solo acepta un ID de plan válido', () => {
    expect(planIdFromResponse(response({ type: 'plan.joined', planId: PLAN_ID }))).toBe(PLAN_ID)
    expect(planIdFromResponse(response({ planId: '../otra-cosa' }))).toBeNull()
    expect(planIdFromResponse(null)).toBeNull()
  })

  it('el aviso que abrió la app se entrega una sola vez', async () => {
    const { push, notifications } = setup()
    notifications.getLastNotificationResponseAsync.mockResolvedValue(response({ planId: PLAN_ID }))

    expect(await push.initialPlanId()).toBe(PLAN_ID)
    expect(await push.initialPlanId()).toBeNull()
  })

  it('al tocar un aviso con la app abierta avisa el plan', () => {
    const { push, listeners } = setup()
    const opened = jest.fn()
    const stop = push.onPlanOpened(opened)

    listeners.response(response({ planId: PLAN_ID }))

    expect(opened).toHaveBeenCalledWith(PLAN_ID)
    stop()
  })
})
