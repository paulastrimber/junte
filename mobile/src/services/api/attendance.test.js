import * as Location from 'expo-location'
import { Camera } from 'expo-camera'
import MockAdapter from 'axios-mock-adapter'

import { requestCameraPermission } from '../camera.js'
import { LOCATION_STATUS, getPreciseLocation } from '../location.js'
import * as checkinsApi from './checkins.js'
import { createApiClient } from './client.js'
import * as participationsApi from './participations.js'
import * as plansApi from './plans.js'

const PLAN_ID = '665f1c2a9b1e8a0012345678'

function setup () {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  return { client, mock: new MockAdapter(client) }
}

describe('api/participations', () => {
  it('joinPlan: POST /plans/:id/join sin cuerpo (la identidad sale del token)', async () => {
    const { client, mock } = setup()
    const participation = { planId: PLAN_ID, status: 'active', joinedAt: '2026-10-20T15:00:00.000Z' }
    mock.onPost(`/plans/${PLAN_ID}/join`).reply(201, participation)

    expect(await participationsApi.joinPlan(PLAN_ID, { client })).toEqual(participation)
    expect(mock.history.post[0].data).toBeUndefined()
  })

  it('leavePlan: DELETE /plans/:id/join (204)', async () => {
    const { client, mock } = setup()
    mock.onDelete(`/plans/${PLAN_ID}/join`).reply(204)

    await expect(participationsApi.leavePlan(PLAN_ID, { client })).resolves.toBeUndefined()
    expect(mock.history.delete).toHaveLength(1)
  })

  it('listParticipants: GET /plans/:id/participants con limit y cursor', async () => {
    const { client, mock } = setup()
    const page = { items: [{ id: 'u1', name: 'Ana', photoUrl: null, reputation: 2 }], nextCursor: null }
    mock.onGet(`/plans/${PLAN_ID}/participants`).reply(200, page)

    expect(await participationsApi.listParticipants(PLAN_ID, { limit: 20, cursor: 'abc' }, { client })).toEqual(page)
    expect(mock.history.get[0].params).toEqual({ limit: 20, cursor: 'abc' })
  })

  it('un rechazo del back llega como ApiError con su code', async () => {
    const { client, mock } = setup()
    mock.onPost(`/plans/${PLAN_ID}/join`).reply(409, { code: 'PLAN_FULL', message: 'El plan no tiene cupos disponibles', requestId: 'r1' })

    await expect(participationsApi.joinPlan(PLAN_ID, { client })).rejects.toMatchObject({ status: 409, code: 'PLAN_FULL', requestId: 'r1' })
  })
})

describe('api/checkins', () => {
  it('createPlanQr: POST /plans/:id/qr', async () => {
    const { client, mock } = setup()
    const qr = { qrToken: `${PLAN_ID}.abc`, expiresAt: '2026-10-25T21:01:30.000Z' }
    mock.onPost(`/plans/${PLAN_ID}/qr`).reply(201, qr, { date: 'Sun, 25 Oct 2026 21:00:00 GMT' })

    expect(await checkinsApi.createPlanQr(PLAN_ID, { client })).toEqual({ ...qr, serverDate: 'Sun, 25 Oct 2026 21:00:00 GMT' })
  })

  it('createPlanQr: sin header Date, serverDate es null', async () => {
    const { client, mock } = setup()
    mock.onPost(`/plans/${PLAN_ID}/qr`).reply(201, { qrToken: `${PLAN_ID}.abc`, expiresAt: '2026-10-25T21:01:30.000Z' })

    expect(await checkinsApi.createPlanQr(PLAN_ID, { client })).toMatchObject({ serverDate: null })
  })

  it('checkIn: POST /plans/:id/check-in con el QR, la ubicación y su precisión', async () => {
    const { client, mock } = setup()
    const body = { qrToken: `${PLAN_ID}.abc`, latitude: -34.9, longitude: -56.16, accuracyMeters: 12 }
    mock.onPost(`/plans/${PLAN_ID}/check-in`).reply(201, { planId: PLAN_ID, method: 'qr-location', distanceMeters: 8 })

    const result = await checkinsApi.checkIn(PLAN_ID, body, { client })

    expect(result).toMatchObject({ method: 'qr-location' })
    expect(JSON.parse(mock.history.post[0].data)).toEqual(body)
  })
})

describe('api/plans · listMyPlans', () => {
  it('GET /users/me/plans con role, when, limit y cursor', async () => {
    const { client, mock } = setup()
    const page = { items: [{ id: PLAN_ID }], nextCursor: null }
    mock.onGet('/users/me/plans').reply(200, page)

    expect(await plansApi.listMyPlans({ role: 'joined', when: 'past', limit: 20, cursor: undefined }, { client })).toEqual(page)
    expect(mock.history.get[0].params).toEqual({ role: 'joined', when: 'past', limit: 20 })
  })
})

describe('services/location · getPreciseLocation', () => {
  const granted = () => Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })

  it('devuelve latitud, longitud y la precisión en metros, pidiendo la mejor precisión', async () => {
    granted()
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -34.9011, longitude: -56.1645, accuracy: 9.5 } })

    expect(await getPreciseLocation()).toEqual({ status: LOCATION_STATUS.GRANTED, latitude: -34.9011, longitude: -56.1645, accuracyMeters: 9.5 })
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High })
  })

  it('sin permiso → denied y no consulta el GPS', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })

    expect(await getPreciseLocation()).toEqual({ status: LOCATION_STATUS.DENIED })
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('sin posición o sin margen de error conocido → unavailable, sin rechazar', async () => {
    granted()
    Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS apagado'))
    expect(await getPreciseLocation()).toEqual({ status: LOCATION_STATUS.UNAVAILABLE })

    Location.getCurrentPositionAsync.mockResolvedValueOnce({ coords: { latitude: -34.9, longitude: -56.16, accuracy: null } })
    expect(await getPreciseLocation()).toEqual({ status: LOCATION_STATUS.UNAVAILABLE })
  })
})

describe('services/camera', () => {
  it('true con permiso, false si se niega o si el sistema falla (no rechaza)', async () => {
    Camera.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'granted' })
    expect(await requestCameraPermission()).toBe(true)

    Camera.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' })
    expect(await requestCameraPermission()).toBe(false)

    Camera.requestCameraPermissionsAsync.mockRejectedValueOnce(new Error('boom'))
    expect(await requestCameraPermission()).toBe(false)
  })
})
