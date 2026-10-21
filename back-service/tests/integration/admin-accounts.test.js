// Script operativo de cuentas admin (S6-BE-04): promover, crear y quitar el rol, sin pasar por la API.
import { describe, expect, it } from 'vitest'
import { User } from '../../src/modules/users/user.model.js'
import { ADMIN_PASSWORD_MIN, createAdmin, demoteAdmin, promoteAdmin } from '../../scripts/admin-accounts.js'
import { useTestDb } from '../helpers/db.js'
import { createFastHasher } from '../helpers/fast-hasher.js'
import { makeUser } from '../helpers/factories.js'

useTestDb()

const PASSWORD = 'una-clave-bien-larga'

describe('promoteAdmin', () => {
  it('le da el rol admin a una cuenta existente (email sin importar mayúsculas ni espacios)', async () => {
    const user = await makeUser({ email: 'ana@um.edu.uy' })

    const result = await promoteAdmin({ email: '  ANA@um.edu.uy ' })

    expect(result).toEqual({ email: 'ana@um.edu.uy', changed: true, status: 'active' })
    expect((await User.findById(user._id).lean()).role).toBe('admin')
    expect((await promoteAdmin({ email: 'ana@um.edu.uy' })).changed).toBe(false)
  })

  it('no cambia el estado de una cuenta suspendida (lo informa)', async () => {
    await makeUser({ email: 'beto@um.edu.uy', status: 'suspended' })

    expect(await promoteAdmin({ email: 'beto@um.edu.uy' })).toMatchObject({ status: 'suspended' })
  })

  it('falla si la cuenta no existe o el email no es válido', async () => {
    await expect(promoteAdmin({ email: 'nadie@um.edu.uy' })).rejects.toThrow(/no existe/)
    await expect(promoteAdmin({ email: 'no-es-un-email' })).rejects.toThrow(/no es válido/)
  })
})

describe('createAdmin', () => {
  it('crea una cuenta admin activa con la contraseña hasheada', async () => {
    const hasher = createFastHasher()

    await createAdmin({ email: 'Admin@Junte.uy', name: ' Admin ', password: PASSWORD, passwordHasher: hasher })

    const saved = await User.findOne({ email: 'admin@junte.uy' }).lean()
    expect(saved).toMatchObject({ name: 'Admin', role: 'admin', status: 'active' })
    expect(saved.passwordHash).not.toContain(PASSWORD)
    expect(await hasher.verify(saved.passwordHash, PASSWORD)).toBe(true)
  })

  it(`exige una contraseña de al menos ${ADMIN_PASSWORD_MIN} caracteres, un nombre y un email libre`, async () => {
    const passwordHasher = createFastHasher()
    await makeUser({ email: 'ana@um.edu.uy' })

    await expect(createAdmin({ email: 'x@um.edu.uy', name: 'X', password: 'corta', passwordHasher })).rejects.toThrow(/contraseña/)
    await expect(createAdmin({ email: 'x@um.edu.uy', name: 'X', password: undefined, passwordHasher })).rejects.toThrow(/ADMIN_PASSWORD/)
    await expect(createAdmin({ email: 'x@um.edu.uy', name: '  ', password: PASSWORD, passwordHasher })).rejects.toThrow(/nombre/)
    await expect(createAdmin({ email: 'ana@um.edu.uy', name: 'Ana', password: PASSWORD, passwordHasher })).rejects.toThrow(/ya existe/)
  })
})

describe('demoteAdmin', () => {
  it('le quita el rol, pero nunca a la última cuenta admin activa', async () => {
    await makeUser({ email: 'uno@junte.uy', role: 'admin' })
    await makeUser({ email: 'dos@junte.uy', role: 'admin' })

    expect(await demoteAdmin({ email: 'uno@junte.uy' })).toEqual({ email: 'uno@junte.uy', changed: true })
    await expect(demoteAdmin({ email: 'dos@junte.uy' })).rejects.toThrow(/única cuenta admin activa/)
    expect(await demoteAdmin({ email: 'uno@junte.uy' })).toEqual({ email: 'uno@junte.uy', changed: false })
  })
})
