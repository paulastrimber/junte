import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createCatalogService } from './catalog.service.js'

const EMPTY = { interestCategories: [], interests: [], universities: [], careers: [], cities: [], neighborhoods: [] }

function setup (ttlMs = 60_000) {
  const clock = createFixedClock('2026-10-11T15:00:00Z')
  let content = { ...EMPTY, cities: [{ key: 'montevideo', name: 'Montevideo', department: 'Montevideo', order: 1, active: true }] }
  const catalogRepo = { loadAll: vi.fn(async () => structuredClone(content)) }
  const service = createCatalogService({ catalogRepo, clock, ttlMs })
  return { service, catalogRepo, clock, edit: (next) => { content = { ...EMPTY, ...next } } }
}

describe('createCatalogService', () => {
  it('lee la base una vez y reutiliza el resultado dentro del TTL', async () => {
    const { service, catalogRepo, clock } = setup()

    await service.getSnapshot()
    clock.advance(59_000)
    await service.getSnapshot()

    expect(catalogRepo.loadAll).toHaveBeenCalledTimes(1)
  })

  it('pasado el TTL vuelve a leer: un cambio del admin se ve en menos de un minuto', async () => {
    const { service, catalogRepo, clock, edit } = setup()
    expect((await service.getPublicCatalog()).cities).toHaveLength(1)
    edit({})

    clock.advance(61_000)

    expect((await service.getPublicCatalog()).cities).toHaveLength(0)
    expect(catalogRepo.loadAll).toHaveBeenCalledTimes(2)
  })

  it('invalidate fuerza la lectura siguiente', async () => {
    const { service, catalogRepo } = setup()
    await service.getSnapshot()

    service.invalidate()
    await service.getSnapshot()

    expect(catalogRepo.loadAll).toHaveBeenCalledTimes(2)
  })

  it('lecturas simultáneas con la caché vacía comparten una sola consulta', async () => {
    const { service, catalogRepo } = setup()

    await Promise.all([service.getSnapshot(), service.getSnapshot(), service.getSnapshot()])

    expect(catalogRepo.loadAll).toHaveBeenCalledTimes(1)
  })

  it('si la lectura falla no deja el error guardado en la caché', async () => {
    const { service, catalogRepo } = setup()
    catalogRepo.loadAll.mockRejectedValueOnce(new Error('mongo caído'))

    await expect(service.getSnapshot()).rejects.toThrow('mongo caído')
    await expect(service.getSnapshot()).resolves.toBeDefined()
  })

  it('checkProfileReferences usa el snapshot vigente', async () => {
    const { service } = setup()

    const details = await service.checkProfileReferences({ current: {}, next: { city: 'atlantida' }, age: 20 })

    expect(details).toEqual([{ path: 'city', message: expect.any(String) }])
  })
})
