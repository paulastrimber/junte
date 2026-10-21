import AsyncStorage from '@react-native-async-storage/async-storage'

import { ApiError, CLIENT_ERROR_CODES } from '../api/errors.js'
import { CACHE_LIMITS, createReadCache, readThrough } from './cache.js'
import { createConnectivity, isOnlineState } from './connectivity.js'
import { OUTBOX_STATUS, createOutbox } from './outbox.js'
import { createKeyValueStore } from './storage.js'

const networkError = () => new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
const apiError = (status, code) => new ApiError({ status, code, message: `error ${code}`, requestId: 'r1' })
const online = (value = true) => ({ isOnline: () => value })

describe('storage', () => {
  it('guarda y lee JSON con su prefijo, y removeAll solo borra ese prefijo', async () => {
    const cache = createKeyValueStore({ prefix: 'junte:cache:' })
    const other = createKeyValueStore({ prefix: 'junte:outbox:' })
    await cache.write('a', { x: 1 })
    await other.write('items', [1])

    expect(await cache.read('a')).toEqual({ x: 1 })
    expect(await cache.read('nada')).toBeNull()
    await cache.removeAll()
    expect(await cache.read('a')).toBeNull()
    expect(await other.read('items')).toEqual([1])
  })

  it('nunca lanza: si el teléfono falla, lee null y escribe false', async () => {
    const broken = { getItem: jest.fn().mockRejectedValue(new Error('x')), setItem: jest.fn().mockRejectedValue(new Error('x')), removeItem: jest.fn().mockRejectedValue(new Error('x')), getAllKeys: jest.fn().mockRejectedValue(new Error('x')) }
    const store = createKeyValueStore({ prefix: 'p:', backend: broken })

    await expect(store.read('a')).resolves.toBeNull()
    await expect(store.write('a', 1)).resolves.toBe(false)
    await expect(store.remove('a')).resolves.toBeUndefined()
    await expect(store.removeAll()).resolves.toBeUndefined()
  })
})

describe('connectivity', () => {
  it('solo cuenta "sin conexión" cuando NetInfo lo sabe (null = conectado)', () => {
    expect(isOnlineState({ isConnected: true, isInternetReachable: null })).toBe(true)
    expect(isOnlineState({ isConnected: false, isInternetReachable: null })).toBe(false)
    expect(isOnlineState({ isConnected: true, isInternetReachable: false })).toBe(false)
  })

  it('avisa los cambios a los suscriptores', async () => {
    let emit
    const netInfo = { addEventListener: jest.fn((listener) => { emit = listener; return jest.fn() }), fetch: jest.fn().mockResolvedValue({ isConnected: true }) }
    const connectivity = createConnectivity({ netInfo })
    const listener = jest.fn()
    connectivity.subscribe(listener)
    connectivity.start()

    emit({ isConnected: false })
    emit({ isConnected: false })
    expect(connectivity.isOnline()).toBe(false)
    emit({ isConnected: true, isInternetReachable: true })

    expect(listener.mock.calls).toEqual([[false], [true]])
  })
})

describe('caché de lecturas', () => {
  const now = () => new Date('2026-10-14T15:00:00Z')
  const makeCache = () => createReadCache({ store: createKeyValueStore({ prefix: 'junte:cache:' }), now })

  it('con conexión pide al servidor y guarda; sin conexión devuelve lo guardado con savedAt', async () => {
    const cache = makeCache()
    const fetch = jest.fn().mockResolvedValue({ id: 'p1' })

    expect(await readThrough({ key: 'plan:p1', fetch, cache, connectivity: online() })).toEqual({ data: { id: 'p1' }, savedAt: null })
    await new Promise((resolve) => setImmediate(resolve))
    const offline = await readThrough({ key: 'plan:p1', fetch, cache, connectivity: online(false) })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(offline).toEqual({ data: { id: 'p1' }, savedAt: '2026-10-14T15:00:00.000Z' })
  })

  it('si la request falla por red usa lo guardado; otro error del servidor se propaga', async () => {
    const cache = makeCache()
    await cache.save('plan:p1', { id: 'p1' })

    await expect(readThrough({ key: 'plan:p1', fetch: () => Promise.reject(networkError()), cache, connectivity: online() }))
      .resolves.toMatchObject({ data: { id: 'p1' } })
    await expect(readThrough({ key: 'plan:p1', fetch: () => Promise.reject(apiError(404, 'NOT_FOUND')), cache, connectivity: online() }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('sin conexión y sin nada guardado, NETWORK_ERROR', async () => {
    await expect(readThrough({ key: 'plan:x', fetch: jest.fn(), cache: makeCache(), connectivity: online(false) }))
      .rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
  })

  it(`guarda como máximo ${CACHE_LIMITS.plan} planes: se borran los más viejos`, async () => {
    let tick = 0
    const cache = createReadCache({ store: createKeyValueStore({ prefix: 'junte:cache:' }), now: () => new Date(Date.UTC(2026, 0, 1) + tick++ * 1000) })
    for (let i = 0; i < CACHE_LIMITS.plan + 2; i++) await cache.save(`plan:${i}`, { i })
    await cache.save('me', { id: 'u1' })

    expect(await cache.load('plan:0')).toBeNull()
    expect(await cache.load('plan:1')).toBeNull()
    expect(await cache.load(`plan:${CACHE_LIMITS.plan + 1}`)).toMatchObject({ data: { i: CACHE_LIMITS.plan + 1 } })
    expect(await cache.load('me')).toMatchObject({ data: { id: 'u1' } })
  })

  it('clear borra todo lo guardado', async () => {
    const cache = makeCache()
    await cache.save('me', { id: 'u1' })
    await cache.clear()
    expect(await cache.load('me')).toBeNull()
  })
})

describe('cola de pendientes', () => {
  let ids
  function makeOutbox ({ executors, connectivity = online() } = {}) {
    ids = 0
    return createOutbox({
      store: createKeyValueStore({ prefix: 'junte:outbox:' }),
      executors: { join: jest.fn(), leave: jest.fn(), message: jest.fn(), report: jest.fn(), ...executors },
      connectivity,
      createId: () => `o${++ids}`,
      now: () => new Date('2026-10-14T15:00:00Z')
    })
  }

  it('sin conexión guarda la escritura como pendiente y la manda cuando se pide flush con red', async () => {
    const connectivity = { value: false, isOnline () { return this.value } }
    const join = jest.fn().mockResolvedValue({ status: 'active' })
    const outbox = makeOutbox({ executors: { join }, connectivity })

    const { item } = await outbox.enqueue('join', { planId: 'p1' })
    expect(item).toMatchObject({ id: 'o1', type: 'join', status: OUTBOX_STATUS.PENDING, createdAt: '2026-10-14T15:00:00.000Z' })
    expect(join).not.toHaveBeenCalled()

    connectivity.value = true
    const settled = jest.fn()
    outbox.onSettled(settled)
    await outbox.flush()

    expect(join).toHaveBeenCalledWith({ planId: 'p1' })
    expect(await outbox.list()).toEqual([])
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), { ok: true, result: { status: 'active' } })
  })

  it('manda en orden y, si se corta la red, para y deja el resto pendiente', async () => {
    const calls = []
    const message = jest.fn(async ({ text }) => {
      calls.push(text)
      if (text === 'dos') throw networkError()
    })
    const connectivity = { value: false, isOnline () { return this.value } }
    const outbox = makeOutbox({ executors: { message }, connectivity })
    await outbox.enqueue('message', { planId: 'p1', text: 'uno', clientId: 'a' })
    await outbox.enqueue('message', { planId: 'p1', text: 'dos', clientId: 'b' })
    await outbox.enqueue('message', { planId: 'p1', text: 'tres', clientId: 'c' })

    connectivity.value = true
    await outbox.flush()

    expect(calls).toEqual(['uno', 'dos'])
    expect((await outbox.list()).map((item) => [item.payload.text, item.status])).toEqual([['dos', 'pending'], ['tres', 'pending']])
  })

  it('un rechazo del servidor (409) queda como "no se pudo enviar" con el motivo, y no frena al resto', async () => {
    const join = jest.fn().mockRejectedValue(apiError(409, 'PLAN_FULL'))
    const report = jest.fn().mockResolvedValue({ id: 'r1' })
    const connectivity = { value: false, isOnline () { return this.value } }
    const outbox = makeOutbox({ executors: { join, report }, connectivity })
    await outbox.enqueue('join', { planId: 'p1' })
    await outbox.enqueue('report', { targetType: 'plan', targetId: 'p1', reason: 'spam' })
    const settled = jest.fn()
    outbox.onSettled(settled)

    connectivity.value = true
    await outbox.flush()

    const [failed] = await outbox.list()
    expect(failed).toMatchObject({ type: 'join', status: OUTBOX_STATUS.FAILED, error: { status: 409, code: 'PLAN_FULL', requestId: 'r1' } })
    expect(report).toHaveBeenCalled()
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ type: 'join' }), { ok: false, error: expect.objectContaining({ code: 'PLAN_FULL' }) })

    // Reintentar la vuelve a mandar; descartarla la saca.
    join.mockResolvedValueOnce({})
    await outbox.retry(failed.id)
    expect(await outbox.list()).toEqual([])
  })

  it('ALREADY_JOINED al reintentar una inscripción cuenta como hecha (la primera había llegado)', async () => {
    const outbox = makeOutbox({ executors: { join: jest.fn().mockRejectedValue(apiError(409, 'ALREADY_JOINED')) } })

    await outbox.enqueue('join', { planId: 'p1' })
    await outbox.flush()

    expect(await outbox.list()).toEqual([])
  })

  it('inscribirse y darse de baja del mismo plan sin conexión se anulan; repetir no duplica', async () => {
    const outbox = makeOutbox({ connectivity: online(false) })

    const first = await outbox.enqueue('join', { planId: 'p1' })
    const again = await outbox.enqueue('join', { planId: 'p1' })
    expect(again.item.id).toBe(first.item.id)
    expect(await outbox.enqueue('leave', { planId: 'p1' })).toEqual({ item: null, cancelled: true })

    expect(await outbox.list()).toEqual([])
  })

  it('lo guardado sobrevive a reabrir la app; lo que quedó "enviando" vuelve a pendiente', async () => {
    const store = createKeyValueStore({ prefix: 'junte:outbox:' })
    await store.write('items', [{ id: 'x', type: 'leave', payload: { planId: 'p1' }, createdAt: 't', status: 'sending', error: null }])
    const outbox = makeOutbox({ connectivity: online(false) })

    expect(await outbox.list()).toEqual([expect.objectContaining({ id: 'x', status: OUTBOX_STATUS.PENDING })])
  })

  it('remove descarta, subscribe avisa cada cambio y clear borra todo (también del teléfono)', async () => {
    const outbox = makeOutbox({ connectivity: online(false) })
    const listener = jest.fn()
    outbox.subscribe(listener)
    const { item } = await outbox.enqueue('report', { targetType: 'user', targetId: 'u1', reason: 'spam' })
    await outbox.enqueue('leave', { planId: 'p2' })

    await outbox.remove(item.id)
    expect((await outbox.list()).map((entry) => entry.type)).toEqual(['leave'])
    await outbox.clear()

    expect(listener).toHaveBeenLastCalledWith([])
    expect(JSON.parse(await AsyncStorage.getItem('junte:outbox:items'))).toEqual([])
  })
})
