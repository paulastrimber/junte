import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { useTestDb } from '../helpers/db.js'
import { User } from '../../src/modules/users/user.model.js'
import { createUserRepository } from '../../src/modules/users/user.repository.js'

useTestDb()

const repo = createUserRepository(User)
const base = { email: 'ana@um.edu.uy', passwordHash: 'hash', name: 'Ana', university: 'UM', interests: ['futbol'] }

describe('create', () => {
  it('guarda el usuario con defaults de rol, estado y reputación', async () => {
    const user = await repo.create(base)

    expect(user).toMatchObject({ email: 'ana@um.edu.uy', name: 'Ana', role: 'user', status: 'active', reputation: 0, interests: ['futbol'] })
    expect(typeof user.id).toBe('string')
  })

  it('traduce el E11000 del email a EMAIL_TAKEN (409)', async () => {
    await repo.create(base)

    await expect(repo.create(base)).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 })
  })

  it('el email se normaliza: mayúsculas y espacios colisionan con el existente', async () => {
    await repo.create(base)

    await expect(repo.create({ ...base, email: '  ANA@UM.edu.uy ' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('un error que no es de email duplicado no se traduce', async () => {
    await expect(repo.create({ ...base, passwordHash: undefined })).rejects.not.toMatchObject({ code: 'EMAIL_TAKEN' })
  })
})

describe('findByEmail', () => {
  it('busca con el email normalizado', async () => {
    await repo.create(base)

    expect(await repo.findByEmail('  ANA@um.edu.uy ')).toMatchObject({ email: 'ana@um.edu.uy' })
  })

  it('devuelve null si no existe', async () => {
    expect(await repo.findByEmail('nadie@um.edu.uy')).toBeNull()
  })

  it('un objeto con operadores de Mongo no se usa como filtro: no matchea a nadie', async () => {
    await repo.create(base)

    expect(await repo.findByEmail({ $ne: null })).toBeNull()
  })
})

describe('findById', () => {
  it('devuelve null si no existe o el id no es válido', async () => {
    expect(await repo.findById(new mongoose.Types.ObjectId().toString())).toBeNull()
    expect(await repo.findById('no-es-un-id')).toBeNull()
  })
})

describe('updateProfile', () => {
  it('actualiza solo los campos recibidos y devuelve el usuario nuevo', async () => {
    const { id } = await repo.create(base)

    const updated = await repo.updateProfile(id, { name: 'Ana María', neighborhood: 'Pocitos', birthDate: new Date('2001-03-09T00:00:00Z') })

    expect(updated).toMatchObject({ name: 'Ana María', neighborhood: 'Pocitos', university: 'UM', interests: ['futbol'] })
    expect(updated.birthDate).toEqual(new Date('2001-03-09T00:00:00Z'))
  })

  it('devuelve null si el usuario no existe', async () => {
    expect(await repo.updateProfile(new mongoose.Types.ObjectId().toString(), { name: 'X' })).toBeNull()
  })

  it('no puede tocar campos solo-backend aunque lleguen en el objeto', async () => {
    const { id } = await repo.create(base)

    const updated = await repo.updateProfile(id, { name: 'Ana', role: 'admin', reputation: 99, status: 'suspended', passwordHash: 'otro' })

    expect(updated).toMatchObject({ role: 'user', reputation: 0, status: 'active', passwordHash: 'hash' })
  })
})

describe('setPhotoKey', () => {
  it('guarda la clave de la foto', async () => {
    const { id } = await repo.create(base)

    const updated = await repo.setPhotoKey(id, `users/${id}/a.jpg`)

    expect(updated.photoKey).toBe(`users/${id}/a.jpg`)
  })
})
