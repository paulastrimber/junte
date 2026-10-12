import MockAdapter from 'axios-mock-adapter'

import { createApiClient } from './client.js'
import * as feedApi from './feed.js'
import * as plansApi from './plans.js'

const PLAN_ID = '665f1c2a9b1e8a0012345678'

function setup () {
  const client = createApiClient({ baseURL: 'http://api.test/api/v1' })
  return { client, mock: new MockAdapter(client) }
}

describe('api/plans', () => {
  it('listPlans: GET /plans con las listas separadas por comas y near como lng,lat', async () => {
    const { client, mock } = setup()
    const page = { items: [{ id: PLAN_ID }], nextCursor: 'abc' }
    mock.onGet('/plans').reply(200, page)

    const result = await plansApi.listPlans({
      near: [-56.1645, -34.9011], radiusKm: 5, interests: ['futbol', 'cine'], priceRanges: ['free', 'low'], availability: 'full', to: '2026-10-20T00:00:00.000Z', limit: 20, cursor: 'xyz'
    }, { client })

    expect(result).toEqual(page)
    expect(mock.history.get[0].params).toEqual({
      near: '-56.1645,-34.9011', radiusKm: 5, interests: 'futbol,cine', priceRanges: 'free,low', availability: 'full', to: '2026-10-20T00:00:00.000Z', limit: 20, cursor: 'xyz'
    })
  })

  it('listPlans no manda filtros vacíos', async () => {
    const { client, mock } = setup()
    mock.onGet('/plans').reply(200, { items: [], nextCursor: null })

    await plansApi.listPlans({ interests: [], priceRanges: [], cursor: undefined, availability: 'available' }, { client })

    expect(mock.history.get[0].params).toEqual({ availability: 'available' })
  })

  it('getPlan: GET /plans/:id', async () => {
    const { client, mock } = setup()
    mock.onGet(`/plans/${PLAN_ID}`).reply(200, { id: PLAN_ID, title: 'Partido' })

    expect(await plansApi.getPlan(PLAN_ID, { client })).toEqual({ id: PLAN_ID, title: 'Partido' })
  })

  it('createPlan: POST /plans con el body tal cual (sin creatorId)', async () => {
    const { client, mock } = setup()
    const body = { title: 'Partido', startsAt: '2026-10-25T21:00:00.000Z', endsAt: '2026-10-25T23:00:00.000Z', location: { label: 'Cancha', coordinates: [-56.16, -34.9] }, capacity: null, price: 0, interests: ['futbol'] }
    mock.onPost('/plans').reply(201, { id: PLAN_ID, ...body })

    const result = await plansApi.createPlan(body, { client })

    expect(result.id).toBe(PLAN_ID)
    expect(JSON.parse(mock.history.post[0].data)).toEqual(body)
  })

  it('updatePlan: PATCH /plans/:id solo con los cambios', async () => {
    const { client, mock } = setup()
    mock.onPatch(`/plans/${PLAN_ID}`).reply(200, { id: PLAN_ID, capacity: null })

    const result = await plansApi.updatePlan(PLAN_ID, { capacity: null }, { client })

    expect(result).toEqual({ id: PLAN_ID, capacity: null })
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ capacity: null })
  })

  it('getPlanFilters: GET /plans/filters', async () => {
    const { client, mock } = setup()
    const options = { priceRanges: [{ key: 'free', min: 0, max: 0 }], radiusKm: { min: 0.5, max: 50, default: 10 } }
    mock.onGet('/plans/filters').reply(200, options)

    expect(await plansApi.getPlanFilters({ client })).toEqual(options)
  })

  it('un error del back llega como ApiError con su code', async () => {
    const { client, mock } = setup()
    mock.onPost('/plans').reply(409, { code: 'PROFILE_INCOMPLETE', message: 'Completá tu perfil', requestId: 'req-1' })

    await expect(plansApi.createPlan({}, { client })).rejects.toMatchObject({ status: 409, code: 'PROFILE_INCOMPLETE', requestId: 'req-1' })
  })
})

describe('api/feed', () => {
  it('getFeed: POST /feed con la posición y el calendario en el body (no en la URL)', async () => {
    const { client, mock } = setup()
    const page = { items: [{ id: PLAN_ID, distanceMeters: 800 }], nextCursor: null }
    mock.onPost('/feed').reply(200, page)
    const body = { near: [-56.1645, -34.9011], radiusKm: 10, availability: 'available', calendar: { from: 'a', to: 'b', busy: [] }, limit: 20 }

    const result = await feedApi.getFeed({ ...body, cursor: undefined, interests: undefined }, { client })

    expect(result).toEqual(page)
    expect(JSON.parse(mock.history.post[0].data)).toEqual(body)
    expect(mock.history.post[0].url).toBe('/feed')
    expect(mock.history.post[0].params).toBeUndefined()
  })
})
