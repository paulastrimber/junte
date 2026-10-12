import { act, renderHook } from '@testing-library/react-native'

import { CATALOG, COMPLETE_USER, USER } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import * as plansApi from '../services/api/plans.js'
import { useAuth } from './useAuth.js'
import { CATALOG_STATUS, useCatalogs } from './useCatalogs.js'
import { usePlanForm } from './usePlanForm.js'

jest.mock('../services/api/plans.js', () => ({ createPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('./useAuth.js', () => ({ useAuth: jest.fn() }))
jest.mock('./useCatalogs.js', () => ({ ...jest.requireActual('./useCatalogs.js'), useCatalogs: jest.fn() }))

const DAY_MS = 24 * 60 * 60 * 1000
const startsAt = new Date(Date.now() + 2 * DAY_MS)
const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)

const PLAN = Object.freeze({
  id: 'p1',
  title: 'Partido de fútbol',
  description: null,
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 0,
  interests: ['futbol']
})

async function fill (result, overrides = {}) {
  const values = { title: 'Partido de fútbol', startsAt, endsAt, coordinates: [-56.16, -34.9], locationLabel: 'Cancha del campus', capacity: '10', ...overrides }
  for (const [field, value] of Object.entries(values)) await act(async () => result.current.setValue(field, value))
  await act(async () => result.current.toggleInterest('futbol'))
}

async function setup ({ plan = null, user = COMPLETE_USER } = {}) {
  useAuth.mockReturnValue({ user })
  const onSaved = jest.fn()
  const view = await renderHook(() => usePlanForm({ plan, onSaved }))
  return { ...view, onSaved }
}

describe('usePlanForm', () => {
  beforeEach(() => {
    plansApi.createPlan.mockReset()
    plansApi.updatePlan.mockReset()
    useCatalogs.mockReturnValue({ status: CATALOG_STATUS.READY, catalog: CATALOG, error: null, retry: jest.fn() })
  })

  describe('crear', () => {
    it('arranca vacío; solo puede crear quien tiene el perfil completo', async () => {
      const complete = await setup()
      const incomplete = await setup({ user: USER })

      expect(complete.result.current).toMatchObject({ isEditing: false, canCreate: true, values: { title: '', price: '0', isUnlimited: false } })
      expect(incomplete.result.current.canCreate).toBe(false)
    })

    it('las opciones con edad mínima solo se le ofrecen a quien la tiene', async () => {
      const adult = await setup()
      const noAge = await setup({ user: USER })
      const keys = (result) => result.current.interestCategories.flatMap((category) => category.interests).map((interest) => interest.key)

      expect(keys(adult.result)).toContain('bares')
      expect(keys(noAge.result)).not.toContain('bares')
    })

    it('valida en el teléfono: con errores no llama a la API y los muestra por campo', async () => {
      const { result, onSaved } = await setup()

      await act(async () => result.current.submit())

      expect(plansApi.createPlan).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(Object.keys(result.current.errors).sort()).toEqual(['capacity', 'coordinates', 'endsAt', 'interests', 'locationLabel', 'startsAt', 'title'])
    })

    it('corregir un campo borra su error', async () => {
      const { result } = await setup()
      await act(async () => result.current.submit())

      await act(async () => result.current.setValue('title', 'Partido'))
      await act(async () => result.current.toggleInterest('futbol'))

      expect(result.current.errors.title).toBeUndefined()
      expect(result.current.errors.interests).toBeUndefined()
      expect(result.current.errors.capacity).toBeDefined()
    })

    it('crea el plan y avisa con lo que devolvió el servidor (no antes)', async () => {
      const pending = deferred()
      plansApi.createPlan.mockReturnValueOnce(pending.promise)
      const { result, onSaved } = await setup()
      await fill(result)

      await act(async () => { result.current.submit() })
      expect(result.current.isSaving).toBe(true)
      expect(onSaved).not.toHaveBeenCalled()

      await act(async () => pending.resolve({ ...PLAN, id: 'nuevo' }))

      expect(plansApi.createPlan).toHaveBeenCalledWith({
        title: 'Partido de fútbol',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
        capacity: 10,
        price: 0,
        interests: ['futbol']
      })
      expect(onSaved).toHaveBeenCalledWith({ ...PLAN, id: 'nuevo' })
      expect(result.current.isSaving).toBe(false)
      expect(result.current.values.title).toBe('') // listo para crear otro
    })

    it('con "Cupo ilimitado" manda capacity null', async () => {
      plansApi.createPlan.mockResolvedValue(PLAN)
      const { result } = await setup()
      await fill(result, { isUnlimited: true, capacity: '' })

      await act(async () => result.current.submit())

      expect(plansApi.createPlan.mock.calls[0][0].capacity).toBeNull()
    })

    it('no envía dos veces si se toca el botón mientras guarda', async () => {
      const pending = deferred()
      plansApi.createPlan.mockReturnValue(pending.promise)
      const { result } = await setup()
      await fill(result)

      await act(async () => { result.current.submit() })
      await act(async () => { result.current.submit() })
      await act(async () => pending.resolve(PLAN))

      expect(plansApi.createPlan).toHaveBeenCalledTimes(1)
    })

    it('un VALIDATION_ERROR del servidor se muestra en el campo del formulario que corresponde', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [
          { path: 'interests', message: 'El interés "x" no existe' },
          { path: 'location.label', message: 'Nombre inválido' },
          { path: 'location.coordinates.1', message: 'Fuera de rango' },
          { path: 'endsAt', message: 'Máximo 7 días' }
        ]
      }))
      const { result, onSaved } = await setup()
      await fill(result)

      await act(async () => result.current.submit())

      expect(result.current.errors).toEqual({ interests: 'El interés "x" no existe', locationLabel: 'Nombre inválido', coordinates: 'Fuera de rango', endsAt: 'Máximo 7 días' })
      expect(result.current.formError).toBeNull()
      expect(onSaved).not.toHaveBeenCalled()
      expect(result.current.values.title).toBe('Partido de fútbol') // conserva lo cargado
    })

    it.each([
      ['PROFILE_INCOMPLETE', 409, /perfil/i],
      [CLIENT_ERROR_CODES.NETWORK_ERROR, 0, /conect/i]
    ])('un error %s se muestra como error general con su requestId', async (code, status, message) => {
      plansApi.createPlan.mockRejectedValue(new ApiError({ status, code, requestId: 'req-1' }))
      const { result } = await setup()
      await fill(result)

      await act(async () => result.current.submit())

      expect(result.current.formError).toMatchObject({ message: expect.stringMatching(message), requestId: 'req-1', code })
      expect(result.current.isSaving).toBe(false)
    })
  })

  describe('editar', () => {
    it('arranca con los datos del plan', async () => {
      const { result } = await setup({ plan: { ...PLAN, capacity: null } })

      expect(result.current).toMatchObject({ isEditing: true, values: { title: 'Partido de fútbol', isUnlimited: true, capacity: '', interests: ['futbol'] } })
    })

    it('manda solo lo que cambió (PATCH parcial)', async () => {
      plansApi.updatePlan.mockResolvedValue({ ...PLAN, price: 200 })
      const { result, onSaved } = await setup({ plan: PLAN })

      await act(async () => result.current.setValue('price', '200'))
      await act(async () => result.current.submit())

      expect(plansApi.updatePlan).toHaveBeenCalledWith('p1', { price: 200 })
      expect(onSaved).toHaveBeenCalledWith({ ...PLAN, price: 200 })
      expect(plansApi.createPlan).not.toHaveBeenCalled()
    })

    it('pasar a cupo ilimitado manda capacity null', async () => {
      plansApi.updatePlan.mockResolvedValue({ ...PLAN, capacity: null })
      const { result } = await setup({ plan: PLAN })

      await act(async () => result.current.setValue('isUnlimited', true))
      await act(async () => result.current.submit())

      expect(plansApi.updatePlan).toHaveBeenCalledWith('p1', { capacity: null })
    })

    it('sin cambios no llama a la API y vuelve con el mismo plan', async () => {
      const { result, onSaved } = await setup({ plan: PLAN })

      await act(async () => result.current.submit())

      expect(plansApi.updatePlan).not.toHaveBeenCalled()
      expect(onSaved).toHaveBeenCalledWith(PLAN)
    })

    it('un plan que ya empezó se puede editar sin tocar el inicio', async () => {
      const started = { ...PLAN, startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
      plansApi.updatePlan.mockResolvedValue(started)
      const { result } = await setup({ plan: started })

      await act(async () => result.current.setValue('title', 'Sigue el partido'))
      await act(async () => result.current.submit())

      expect(result.current.errors.startsAt).toBeUndefined()
      expect(plansApi.updatePlan).toHaveBeenCalledWith('p1', { title: 'Sigue el partido' })
    })

    it('409 CAPACITY_BELOW_PARTICIPANTS se muestra junto al cupo', async () => {
      plansApi.updatePlan.mockRejectedValue(new ApiError({ status: 409, code: 'CAPACITY_BELOW_PARTICIPANTS', message: 'El cupo no puede ser menor que los 4 inscriptos' }))
      const { result, onSaved } = await setup({ plan: PLAN })

      await act(async () => result.current.setValue('capacity', '3'))
      await act(async () => result.current.submit())

      expect(result.current.errors).toEqual({ capacity: 'El cupo no puede ser menor que los 4 inscriptos' })
      expect(onSaved).not.toHaveBeenCalled()
    })
  })
})
