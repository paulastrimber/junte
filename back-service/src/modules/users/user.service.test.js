import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { createMemoryStorage } from '../../adapters/storage/index.js'
import { MAX_IMAGE_BYTES } from '../../shared/uploads.js'
import { createUserService, isProfileComplete } from './user.service.js'

const USER_ID = '665f1c2a9b1e8a0012345678'
const OTHER_ID = '775f1c2a9b1e8a0012345679'
const BIRTH = new Date('2001-03-09T00:00:00Z')

const completeUser = () => ({ id: USER_ID, name: 'Ana', birthDate: BIRTH, interests: ['futbol'] })

describe('isProfileComplete', () => {
  it('es completo con name + birthDate + al menos 1 interés', () => {
    expect(isProfileComplete(completeUser())).toBe(true)
  })

  it('university, barrio y localidad son opcionales: no cambian el resultado', () => {
    expect(isProfileComplete({ ...completeUser(), university: undefined, neighborhood: undefined, city: undefined })).toBe(true)
    expect(isProfileComplete({ ...completeUser(), university: 'UM', neighborhood: 'Pocitos', city: 'Montevideo' })).toBe(true)
  })

  it.each([
    ['sin name', { name: undefined }],
    ['name vacío', { name: '' }],
    ['name solo espacios', { name: '   ' }],
    ['sin birthDate', { birthDate: undefined }],
    ['birthDate null', { birthDate: null }],
    ['birthDate inválida', { birthDate: new Date('nope') }],
    ['birthDate como texto', { birthDate: '2001-03-09' }],
    ['sin intereses', { interests: [] }],
    ['intereses ausentes', { interests: undefined }]
  ])('es incompleto %s', (_label, override) => {
    expect(isProfileComplete({ ...completeUser(), ...override })).toBe(false)
  })

  it('un usuario inexistente no tiene perfil completo', () => {
    expect(isProfileComplete(null)).toBe(false)
    expect(isProfileComplete(undefined)).toBe(false)
  })
})

function setup ({ user = completeUser() } = {}) {
  const clock = createFixedClock('2026-10-11T15:00:00Z')
  const storage = createMemoryStorage({ clock })
  const deleteObject = vi.spyOn(storage, 'deleteObject')
  const state = { user }
  const userRepo = {
    findById: vi.fn(async (id) => (state.user && id === state.user.id ? { ...state.user } : null)),
    updateProfile: vi.fn(async (id, changes) => {
      if (!state.user || id !== state.user.id) return null
      state.user = { ...state.user, ...changes }
      return { ...state.user }
    }),
    setPhotoKey: vi.fn(async (id, photoKey) => {
      if (!state.user || id !== state.user.id) return null
      state.user = { ...state.user, photoKey }
      return { ...state.user }
    })
  }
  const logger = { warn: vi.fn() }
  const service = createUserService({ userRepo, storage, logger })
  return { service, userRepo, storage, deleteObject, state, logger }
}

describe('getProfile', () => {
  it('devuelve el usuario', async () => {
    const { service } = setup()

    expect(await service.getProfile(USER_ID)).toMatchObject({ id: USER_ID, name: 'Ana' })
  })

  it('si el usuario ya no existe responde 401 (GET /users/me no tiene 404)', async () => {
    const { service } = setup({ user: null })

    await expect(service.getProfile(USER_ID)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })
})

describe('updateProfile', () => {
  it('guarda los cambios y devuelve el usuario actualizado', async () => {
    const { service, userRepo } = setup()

    const updated = await service.updateProfile({ userId: USER_ID, changes: { city: 'Montevideo' } })

    expect(userRepo.updateProfile).toHaveBeenCalledWith(USER_ID, { city: 'Montevideo' })
    expect(updated.city).toBe('Montevideo')
  })

  it('si el usuario ya no existe responde 401', async () => {
    const { service } = setup({ user: null })

    await expect(service.updateProfile({ userId: USER_ID, changes: { city: 'X' } })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })
})

describe('setPhoto', () => {
  const keyFor = (userId, name = 'abc-123.jpg') => `users/${userId}/${name}`

  function upload (storage, key, meta = {}) {
    storage.putObject(key, { contentType: 'image/jpeg', sizeBytes: 1000, ...meta })
  }

  it('vincula la foto si el objeto es del dueño, existe y es una imagen válida', async () => {
    const { service, storage, userRepo } = setup()
    upload(storage, keyFor(USER_ID))

    const user = await service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID) })

    expect(userRepo.setPhotoKey).toHaveBeenCalledWith(USER_ID, keyFor(USER_ID))
    expect(user.photoKey).toBe(keyFor(USER_ID))
  })

  it('un objeto de otro usuario → 403 y no consulta el storage', async () => {
    const { service, storage, userRepo } = setup()
    upload(storage, keyFor(OTHER_ID))
    const head = vi.spyOn(storage, 'headObject')

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(OTHER_ID) })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(head).not.toHaveBeenCalled()
    expect(userRepo.setPhotoKey).not.toHaveBeenCalled()
  })

  it('un objeto de otro usuario no se borra', async () => {
    const { service, storage, deleteObject } = setup()
    upload(storage, keyFor(OTHER_ID))

    await service.setPhoto({ userId: USER_ID, objectKey: keyFor(OTHER_ID) }).catch(() => {})

    expect(deleteObject).not.toHaveBeenCalled()
    expect(await storage.headObject(keyFor(OTHER_ID))).not.toBeNull()
  })

  it.each([
    `users/${USER_ID}/../${OTHER_ID}/a.jpg`,
    `users/${USER_ID}/sub/a.jpg`,
    `users/${USER_ID}/a.exe`,
    `users/${USER_ID}/`
  ])('una clave con forma inválida bajo el prefijo propio (%s) → 400', async (objectKey) => {
    const { service } = setup()

    await expect(service.setPhoto({ userId: USER_ID, objectKey })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('el objeto no existe en el storage → 404', async () => {
    const { service } = setup()

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID) })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it.each([
    ['text/html', 'a.jpg'],
    ['image/gif', 'a.jpg'],
    ['image/png', 'a.jpg'] // la extensión de la clave dice jpg pero el objeto es png
  ])('tipo real %s para la clave %s → 400 y borra el objeto', async (contentType, name) => {
    const { service, storage } = setup()
    upload(storage, keyFor(USER_ID, name), { contentType })

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID, name) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(await storage.headObject(keyFor(USER_ID, name))).toBeNull()
  })

  it.each([MAX_IMAGE_BYTES + 1, 0])('tamaño real %i → 400 y borra el objeto', async (sizeBytes) => {
    const { service, storage, userRepo } = setup()
    upload(storage, keyFor(USER_ID), { sizeBytes })

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(await storage.headObject(keyFor(USER_ID))).toBeNull()
    expect(userRepo.setPhotoKey).not.toHaveBeenCalled()
  })

  it('exactamente el tamaño máximo es válido', async () => {
    const { service, storage } = setup()
    upload(storage, keyFor(USER_ID), { sizeBytes: MAX_IMAGE_BYTES })

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID) })).resolves.toMatchObject({ photoKey: keyFor(USER_ID) })
  })

  it('al cambiar de foto borra la anterior, después de guardar la nueva', async () => {
    const previous = keyFor(USER_ID, 'old-1.jpg')
    const { service, storage, deleteObject, userRepo } = setup({ user: { ...completeUser(), photoKey: previous } })
    upload(storage, previous)
    upload(storage, keyFor(USER_ID, 'new-2.jpg'))
    deleteObject.mockImplementation(async () => {
      expect(userRepo.setPhotoKey).toHaveBeenCalled() // el efecto secundario va después de la escritura
    })

    await service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID, 'new-2.jpg') })

    expect(deleteObject).toHaveBeenCalledWith(previous)
  })

  it('si falla el borrado de la foto anterior no falla la request', async () => {
    const previous = keyFor(USER_ID, 'old-1.jpg')
    const { service, storage, deleteObject, logger } = setup({ user: { ...completeUser(), photoKey: previous } })
    upload(storage, keyFor(USER_ID, 'new-2.jpg'))
    deleteObject.mockRejectedValue(new Error('boom'))

    await expect(service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID, 'new-2.jpg') })).resolves.toMatchObject({ photoKey: keyFor(USER_ID, 'new-2.jpg') })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('confirmar dos veces la misma foto no la borra', async () => {
    const { service, storage, deleteObject } = setup({ user: { ...completeUser(), photoKey: keyFor(USER_ID) } })
    upload(storage, keyFor(USER_ID))

    await service.setPhoto({ userId: USER_ID, objectKey: keyFor(USER_ID) })

    expect(deleteObject).not.toHaveBeenCalled()
  })
})
