import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createMemoryStorage } from '../../adapters/storage/index.js'
import { encodeCursor } from '../../shared/pagination.js'
import { createPlanService } from './plan.service.js'
import { PRICE_RANGES } from './plan.rules.js'

const CREATOR_ID = '665f1c2a9b1e8a0012345678'
const OTHER_ID = '775f1c2a9b1e8a0012345679'
const PLAN_ID = '885f1c2a9b1e8a001234567a'
const NOW = '2026-10-11T15:00:00Z'
const at = (iso) => new Date(iso)

const completeUser = (overrides = {}) => ({
  id: CREATOR_ID, name: 'Ana', birthDate: at('2001-03-09T00:00:00Z'), interests: ['futbol'], university: 'um', ...overrides
})

const planData = (overrides = {}) => ({
  title: 'Partido de fútbol',
  description: 'Actividad recreativa',
  startsAt: at('2026-10-25T21:00:00Z'),
  endsAt: at('2026-10-25T23:00:00Z'),
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 0,
  interests: ['futbol'],
  ...overrides
})

const storedPlan = (overrides = {}) => ({
  id: PLAN_ID, ...planData(), creatorId: CREATOR_ID, university: 'um', participantCount: 0, status: 'open', createdAt: at('2026-10-01T12:00:00Z'), ...overrides
})

function setup ({ users = [completeUser(), completeUser({ id: OTHER_ID, name: 'Beto' })], plan = null, participants = [] } = {}) {
  const clock = createFixedClock(NOW)
  const storage = createMemoryStorage({ clock })
  const state = { plan }
  const planRepo = {
    create: vi.fn(async (data) => { state.plan = storedPlan({ ...data }); return { ...state.plan } }),
    findById: vi.fn(async (id) => (state.plan && id === state.plan.id ? { ...state.plan } : null)),
    updateByCreator: vi.fn(async (id, creatorId, changes) => {
      const current = state.plan
      if (!current || current.id !== id || current.creatorId !== creatorId) return null
      if (!['open', 'closed'].includes(current.status)) return null
      if (typeof changes.capacity === 'number' && current.participantCount > changes.capacity) return null
      state.plan = { ...current, ...changes }
      return { ...state.plan }
    }),
    setPhotoKey: vi.fn(async (id, creatorId, photoKey) => {
      if (!state.plan || state.plan.id !== id || state.plan.creatorId !== creatorId) return null
      state.plan = { ...state.plan, photoKey }
      return { ...state.plan }
    }),
    listUpcoming: vi.fn(async () => [])
  }
  const userRepo = {
    findById: vi.fn(async (id) => users.find((user) => user.id === id) ?? null),
    findByIds: vi.fn(async (ids) => users.filter((user) => ids.includes(user.id)))
  }
  const participationRepo = {
    isActiveParticipant: vi.fn(async (_planId, userId) => participants.includes(userId)),
    findByUserAndPlans: vi.fn(async () => []),
    findActivePlanIds: vi.fn(async () => [])
  }
  const checkInRepo = { findByUserAndPlans: vi.fn(async () => []) }
  const catalogs = { checkInterests: vi.fn(async () => []) }
  const isProfileComplete = (user) => Boolean(user.name && user.birthDate && user.interests.length > 0)
  const logger = { warn: vi.fn(), info: vi.fn() }
  const service = createPlanService({ planRepo, userRepo, participationRepo, checkInRepo, catalogs, isProfileComplete, storage, clock, logger })
  return { service, planRepo, userRepo, participationRepo, catalogs, storage, clock, logger, state }
}

describe('create', () => {
  it('toma creatorId del token y university del perfil del creador', async () => {
    const { service, planRepo } = setup()

    const { plan, creator } = await service.create({ creatorId: CREATOR_ID, data: planData() })

    expect(planRepo.create).toHaveBeenCalledWith({ ...planData(), creatorId: CREATOR_ID, university: 'um' })
    expect(plan).toMatchObject({ creatorId: CREATOR_ID, university: 'um', participantCount: 0, status: 'open' })
    expect(creator.id).toBe(CREATOR_ID)
  })

  it('sin universidad en el perfil el plan queda sin universidad', async () => {
    const { service, planRepo } = setup({ users: [completeUser({ university: undefined })] })

    await service.create({ creatorId: CREATOR_ID, data: planData() })

    expect(planRepo.create).toHaveBeenCalledWith(expect.objectContaining({ university: undefined }))
  })

  it('con el perfil incompleto → 409 PROFILE_INCOMPLETE y no crea nada', async () => {
    const { service, planRepo } = setup({ users: [completeUser({ birthDate: undefined })] })

    await expect(service.create({ creatorId: CREATOR_ID, data: planData() })).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE', status: 409 })
    expect(planRepo.create).not.toHaveBeenCalled()
  })

  it.each([
    ['empieza en el pasado', { startsAt: at('2026-10-11T14:00:00Z'), endsAt: at('2026-10-11T16:00:00Z') }, 'startsAt'],
    ['empieza exactamente ahora', { startsAt: at(NOW), endsAt: at('2026-10-11T16:00:00Z') }, 'startsAt'],
    ['termina antes de empezar', { endsAt: at('2026-10-25T20:00:00Z') }, 'endsAt'],
    ['termina cuando empieza', { endsAt: at('2026-10-25T21:00:00Z') }, 'endsAt'],
    ['dura más de 7 días', { endsAt: at('2026-11-01T21:00:01Z') }, 'endsAt']
  ])('fechas incoherentes (%s) → 400 con el campo', async (_label, override, path) => {
    const { service, planRepo } = setup()

    const error = await service.create({ creatorId: CREATOR_ID, data: planData(override) }).catch((e) => e)

    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(error.details.map((detail) => detail.path)).toEqual([path])
    expect(planRepo.create).not.toHaveBeenCalled()
  })

  it('acepta un plan de exactamente 7 días (campamento)', async () => {
    const { service } = setup()

    await expect(service.create({ creatorId: CREATOR_ID, data: planData({ endsAt: at('2026-11-01T21:00:00Z') }) })).resolves.toBeDefined()
  })

  it('valida los intereses contra el catálogo con la edad del creador', async () => {
    const { service, catalogs, planRepo } = setup()
    catalogs.checkInterests.mockResolvedValue([{ path: 'interests', message: 'El interés "x" no existe' }])

    const error = await service.create({ creatorId: CREATOR_ID, data: planData({ interests: ['x'] }) }).catch((e) => e)

    expect(catalogs.checkInterests).toHaveBeenCalledWith({ keys: ['x'], age: 25 }) // nació el 2001-03-09
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ path: 'interests', message: expect.any(String) }] })
    expect(planRepo.create).not.toHaveBeenCalled()
  })

  it('si el usuario ya no existe responde 401', async () => {
    const { service } = setup({ users: [] })

    await expect(service.create({ creatorId: CREATOR_ID, data: planData() })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('getVisible (regla de visibilidad)', () => {
  const past = { startsAt: at('2026-10-10T18:00:00Z'), endsAt: at('2026-10-10T20:00:00Z') }

  it.each(['open', 'closed'])('un plan %s que todavía no terminó lo ve cualquiera, con su creador', async (status) => {
    const { service } = setup({ plan: storedPlan({ status }) })

    const { plan, creator } = await service.getVisible({ planId: PLAN_ID, userId: OTHER_ID })

    expect(plan.id).toBe(PLAN_ID)
    expect(creator).toMatchObject({ id: CREATOR_ID, name: 'Ana' })
  })

  it('un plan en curso (empezó y no terminó) sigue visible', async () => {
    const { service } = setup({ plan: storedPlan({ startsAt: at('2026-10-11T14:00:00Z'), endsAt: at('2026-10-11T16:00:00Z') }) })

    await expect(service.getVisible({ planId: PLAN_ID, userId: OTHER_ID })).resolves.toBeDefined()
  })

  it.each([
    ['cancelado', { status: 'cancelled' }],
    ['completado', { status: 'completed' }],
    ['ya terminado', past]
  ])('un plan %s → 404 para un tercero', async (_label, override) => {
    const { service } = setup({ plan: storedPlan(override) })

    await expect(service.getVisible({ planId: PLAN_ID, userId: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it.each([
    ['cancelado', { status: 'cancelled' }],
    ['ya terminado', past]
  ])('un plan %s lo siguen viendo su creador y sus inscriptos', async (_label, override) => {
    const { service } = setup({ plan: storedPlan(override), participants: [OTHER_ID] })

    await expect(service.getVisible({ planId: PLAN_ID, userId: CREATOR_ID })).resolves.toBeDefined()
    await expect(service.getVisible({ planId: PLAN_ID, userId: OTHER_ID })).resolves.toBeDefined()
  })

  it('un plan que no existe → 404', async () => {
    const { service } = setup()

    await expect(service.getVisible({ planId: PLAN_ID, userId: CREATOR_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('update', () => {
  it('el creador edita y recibe el plan actualizado', async () => {
    const { service, planRepo } = setup({ plan: storedPlan() })

    const { plan } = await service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { title: 'Otro título', price: 200 } })

    expect(planRepo.updateByCreator).toHaveBeenCalledWith(PLAN_ID, CREATOR_ID, { title: 'Otro título', price: 200 })
    expect(plan).toMatchObject({ title: 'Otro título', price: 200 })
  })

  it('un plan ajeno → 403 y no escribe', async () => {
    const { service, planRepo } = setup({ plan: storedPlan() })

    await expect(service.update({ planId: PLAN_ID, userId: OTHER_ID, changes: { title: 'Hackeado' } })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(planRepo.updateByCreator).not.toHaveBeenCalled()
  })

  it('un plan ajeno que el usuario no puede ver → 404 (no se revela que existe)', async () => {
    const { service } = setup({ plan: storedPlan({ status: 'cancelled' }) })

    await expect(service.update({ planId: PLAN_ID, userId: OTHER_ID, changes: { title: 'Hackeado' } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it.each(['cancelled', 'completed'])('un plan %s ya no se edita → 409 PLAN_CLOSED', async (status) => {
    const { service } = setup({ plan: storedPlan({ status }) })

    await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { title: 'Otro título' } })).rejects.toMatchObject({ code: 'PLAN_CLOSED', status: 409 })
  })

  describe('cupo', () => {
    it('bajar el cupo por debajo de los inscriptos → 409 CAPACITY_BELOW_PARTICIPANTS', async () => {
      const { service, state } = setup({ plan: storedPlan({ capacity: 10, participantCount: 4 }) })

      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { capacity: 3 } })).rejects.toMatchObject({ code: 'CAPACITY_BELOW_PARTICIPANTS', status: 409 })
      expect(state.plan.capacity).toBe(10)
    })

    it('bajar el cupo exactamente a los inscriptos es válido', async () => {
      const { service } = setup({ plan: storedPlan({ capacity: 10, participantCount: 4 }) })

      const { plan } = await service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { capacity: 4 } })

      expect(plan.capacity).toBe(4)
    })

    it('pasar a cupo ilimitado (null) siempre se puede, aunque haya inscriptos', async () => {
      const { service } = setup({ plan: storedPlan({ capacity: 4, participantCount: 4 }) })

      const { plan } = await service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { capacity: null } })

      expect(plan.capacity).toBeNull()
    })

    it('pasar de ilimitado a un número menor a los inscriptos → 409; igual o mayor es válido', async () => {
      const { service } = setup({ plan: storedPlan({ capacity: null, participantCount: 30 }) })

      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { capacity: 29 } })).rejects.toMatchObject({ code: 'CAPACITY_BELOW_PARTICIPANTS' })
      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { capacity: 30 } })).resolves.toBeDefined()
    })
  })

  describe('fechas (se validan sobre el plan resultante)', () => {
    it('cambiar solo endsAt se compara con el startsAt guardado', async () => {
      const { service } = setup({ plan: storedPlan() })

      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { endsAt: at('2026-10-25T20:59:00Z') } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { endsAt: at('2026-10-26T02:00:00Z') } })).resolves.toBeDefined()
    })

    it('cambiar solo startsAt no puede dejar al plan con más de 7 días ni en el pasado', async () => {
      // El plan guardado va del 25/10 21:00 al 25/10 23:00 (UTC); "ahora" es el 11/10 15:00.
      const patch = (plan, startsAt) => setup({ plan }).service
        .update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { startsAt } }).catch((e) => e)
      const soon = storedPlan({ startsAt: at('2026-10-12T21:00:00Z'), endsAt: at('2026-10-12T23:00:00Z') })

      expect((await patch(storedPlan(), at('2026-10-18T20:00:00Z'))).details).toEqual([{ path: 'endsAt', message: expect.stringMatching(/7 días/) }])
      expect((await patch(soon, at('2026-10-11T14:00:00Z'))).details).toEqual([{ path: 'startsAt', message: expect.any(String) }])
      expect((await patch(soon, at('2026-10-12T20:00:00Z'))).plan.startsAt).toEqual(at('2026-10-12T20:00:00Z'))
    })

    it('un plan en curso se puede editar sin tocar startsAt (no se exige que empiece en el futuro)', async () => {
      const started = storedPlan({ startsAt: at('2026-10-11T14:00:00Z'), endsAt: at('2026-10-11T16:00:00Z') })
      const { service } = setup({ plan: started })

      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { endsAt: at('2026-10-11T17:00:00Z') } })).resolves.toBeDefined()
      await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { startsAt: started.startsAt, title: 'Mismo inicio' } })).resolves.toBeDefined()
    })
  })

  it('al cambiar los intereses conserva los que el plan ya tenía (aunque estén desactivados)', async () => {
    const { service, catalogs } = setup({ plan: storedPlan({ interests: ['rugby'] }) })

    await service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { interests: ['rugby', 'cine'] } })

    expect(catalogs.checkInterests).toHaveBeenCalledWith({ keys: ['rugby', 'cine'], kept: ['rugby'], age: 25 })
  })

  it('si los intereses nuevos no son válidos → 400 y no escribe', async () => {
    const { service, catalogs, planRepo } = setup({ plan: storedPlan() })
    catalogs.checkInterests.mockResolvedValue([{ path: 'interests', message: 'no existe' }])

    await expect(service.update({ planId: PLAN_ID, userId: CREATOR_ID, changes: { interests: ['x'] } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(planRepo.updateByCreator).not.toHaveBeenCalled()
  })
})

describe('setPhoto', () => {
  const key = (planId = PLAN_ID, name = 'abc-123.jpg') => `plans/${planId}/${name}`
  const upload = (storage, objectKey, meta = {}) => storage.putObject(objectKey, { contentType: 'image/jpeg', sizeBytes: 1000, ...meta })

  it('el creador vincula una foto subida bajo plans/<planId>/', async () => {
    const { service, storage } = setup({ plan: storedPlan() })
    upload(storage, key())

    const { plan } = await service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key() })

    expect(plan.photoKey).toBe(key())
  })

  it('otro usuario → 403 y no consulta el storage', async () => {
    const { service, storage } = setup({ plan: storedPlan() })
    upload(storage, key())
    const head = vi.spyOn(storage, 'headObject')

    await expect(service.setPhoto({ planId: PLAN_ID, userId: OTHER_ID, objectKey: key() })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(head).not.toHaveBeenCalled()
  })

  it('una clave de otro plan o de un usuario → 403', async () => {
    const { service } = setup({ plan: storedPlan() })

    await expect(service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key('995f1c2a9b1e8a001234567b') })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: `users/${CREATOR_ID}/abc.jpg` })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('el objeto no existe → 404; no es una imagen → 400 y se borra', async () => {
    const { service, storage } = setup({ plan: storedPlan() })
    upload(storage, key(PLAN_ID, 'texto.jpg'), { contentType: 'text/html' })

    await expect(service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key(PLAN_ID, 'texto.jpg') })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(await storage.headObject(key(PLAN_ID, 'texto.jpg'))).toBeNull()
  })

  it('al cambiar de foto borra la anterior; si el borrado falla no falla la request', async () => {
    const previous = key(PLAN_ID, 'old-1.jpg')
    const { service, storage, logger } = setup({ plan: storedPlan({ photoKey: previous }) })
    upload(storage, previous)
    upload(storage, key(PLAN_ID, 'new-2.jpg'))
    upload(storage, key(PLAN_ID, 'new-3.jpg'))

    await service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key(PLAN_ID, 'new-2.jpg') })
    expect(await storage.headObject(previous)).toBeNull()

    vi.spyOn(storage, 'deleteObject').mockRejectedValue(new Error('boom'))
    await expect(service.setPhoto({ planId: PLAN_ID, userId: CREATOR_ID, objectKey: key(PLAN_ID, 'new-3.jpg') })).resolves.toBeDefined()
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('assertCreator', () => {
  it('devuelve el plan al creador; 403 a otro usuario; 404 si no existe', async () => {
    const { service } = setup({ plan: storedPlan() })

    await expect(service.assertCreator({ planId: PLAN_ID, userId: CREATOR_ID })).resolves.toMatchObject({ id: PLAN_ID })
    await expect(service.assertCreator({ planId: PLAN_ID, userId: OTHER_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(service.assertCreator({ planId: '995f1c2a9b1e8a001234567b', userId: CREATOR_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('list (cronológico)', () => {
  const plans = (count) => Array.from({ length: count }, (_, i) => storedPlan({
    id: `885f1c2a9b1e8a00123456${String(i).padStart(2, '0')}`, startsAt: at(`2026-10-2${i}T21:00:00Z`)
  }))

  it('pide uno de más y devuelve nextCursor solo si hay otra página', async () => {
    const { service, planRepo } = setup()
    planRepo.listUpcoming.mockResolvedValueOnce(plans(3)).mockResolvedValueOnce(plans(2))

    const withMore = await service.list({ filters: { availability: 'available' }, limit: 2 })
    const lastPage = await service.list({ filters: { availability: 'available' }, limit: 2 })

    expect(planRepo.listUpcoming).toHaveBeenCalledWith({ filters: { availability: 'available' }, now: at(NOW), after: null, limit: 3 })
    expect(withMore.items).toHaveLength(2)
    expect(withMore.nextCursor).toEqual(expect.any(String))
    expect(lastPage.nextCursor).toBeNull()
  })

  it('el cursor lleva la última clave de orden (startsAt + id) a la consulta siguiente', async () => {
    const { service, planRepo } = setup()
    const [first, second, third] = plans(3)
    planRepo.listUpcoming.mockResolvedValueOnce([first, second, third]).mockResolvedValueOnce([third])
    const { nextCursor } = await service.list({ filters: {}, limit: 2 })

    await service.list({ filters: {}, limit: 2, cursor: nextCursor })

    expect(planRepo.listUpcoming).toHaveBeenLastCalledWith(expect.objectContaining({ after: { startsAt: second.startsAt, id: second.id } }))
  })

  it('cada plan sale con su creador, con una sola consulta de usuarios', async () => {
    const { service, planRepo, userRepo } = setup()
    planRepo.listUpcoming.mockResolvedValue(plans(2))

    const { items } = await service.list({ filters: {}, limit: 20 })

    expect(items.map(({ creator }) => creator.id)).toEqual([CREATOR_ID, CREATOR_ID])
    expect(userRepo.findByIds).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['basura', '%%%'],
    ['otra forma', encodeCursor({ o: 2, t: 0, f: '0'.repeat(16) })],
    ['operador de Mongo', encodeCursor({ s: { $gt: 0 }, i: PLAN_ID })],
    ['id inválido', encodeCursor({ s: 1, i: 'nope' })]
  ])('un cursor manipulado (%s) → 400 y no consulta', async (_label, cursor) => {
    const { service, planRepo } = setup()

    await expect(service.list({ filters: {}, limit: 2, cursor })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(planRepo.listUpcoming).not.toHaveBeenCalled()
  })
})

describe('getFilterOptions', () => {
  it('expone los rangos de precio definidos en un solo lugar y el radio permitido', () => {
    const { service } = setup()

    expect(service.getFilterOptions()).toEqual({
      priceRanges: PRICE_RANGES.map(({ key, min, max }) => ({ key, min, max })),
      radiusKm: { min: 0.5, max: 50, default: 10 }
    })
  })
})
