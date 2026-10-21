// Contrato de la edición de catálogos desde el panel (S6, ADR-0009): listar (activo o no), crear y modificar filas.
// Nunca se borran. La key y el "padre" no cambian. Un cambio se ve enseguida en GET /catalogs de la misma instancia.
import { afterEach, describe, expect, it } from 'vitest'
import { Interest } from '../../src/modules/catalogs/catalog.model.js'
import { User } from '../../src/modules/users/user.model.js'
import { removeTestCatalogRows, useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, setupApi } from '../helpers/plans-api.js'

useTestDb()
afterEach(removeTestCatalogRows)

const UNKNOWN_ID = '0123456789abcdef01234567'

async function scenario () {
  const api = setupApi()
  const admin = await api.signUp({ name: 'Admin' })
  await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } })
  const ana = await api.signUp({ name: 'Ana' })
  return { ...api, admin, ana }
}

const publicInterestKeys = (catalog) => catalog.interestCategories.flatMap((category) => category.interests.map((interest) => interest.key))

describe('GET /admin/catalogs/:catalog', () => {
  it('lista las filas activas e inactivas con sus campos propios', async () => {
    const { admin } = await scenario()
    const inactive = await Interest.create({ key: 'test-inactivo', name: 'Inactivo', order: 7, active: false, categoryKey: 'deportes' })

    const res = await admin.api.get('/admin/catalogs/interests')

    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThan(50)
    expect(res.body.items.find((row) => row.key === 'test-inactivo')).toEqual({
      id: String(inactive._id), key: 'test-inactivo', name: 'Inactivo', order: 7, active: false, categoryKey: 'deportes', minAge: null, updatedAt: expect.any(String)
    })
    const careers = await admin.api.get('/admin/catalogs/careers')
    expect(careers.body.items[0]).toEqual(expect.objectContaining({ universityKey: expect.any(String), group: expect.anything() }))
  })

  it('400 con un catálogo desconocido', async () => {
    const { admin } = await scenario()

    expectValidationError(await admin.api.get('/admin/catalogs/paises'), expect)
  })
})

describe('POST /admin/catalogs/:catalog', () => {
  it('crea una opción y GET /catalogs la muestra enseguida', async () => {
    const { admin, ana } = await scenario()
    const before = await ana.api.get('/catalogs')

    const res = await admin.api.post('/admin/catalogs/interests', { key: 'test-tejo', name: 'Tejo', categoryKey: 'deportes', order: 99, minAge: 18 })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ key: 'test-tejo', name: 'Tejo', order: 99, active: true, categoryKey: 'deportes', minAge: 18 })
    const after = await ana.api.get('/catalogs')
    expect(publicInterestKeys(after.body)).toContain('test-tejo')
    expect(after.body.version).not.toBe(before.body.version)
  })

  it('crea en cada catálogo con sus campos obligatorios', async () => {
    const { admin } = await scenario()

    expect((await admin.api.post('/admin/catalogs/interest-categories', { key: 'test-cat', name: 'Categoría' })).status).toBe(201)
    expect((await admin.api.post('/admin/catalogs/universities', { key: 'test-uni', name: 'Universidad Test', shortName: 'UT' })).status).toBe(201)
    expect((await admin.api.post('/admin/catalogs/careers', { key: 'test-carrera', name: 'Carrera', universityKey: 'test-uni', group: 'Facultad' })).status).toBe(201)
    expect((await admin.api.post('/admin/catalogs/cities', { key: 'test-ciudad', name: 'Ciudad', department: 'Canelones' })).status).toBe(201)
    expect((await admin.api.post('/admin/catalogs/neighborhoods', { key: 'test-barrio', name: 'Barrio', cityKey: 'test-ciudad' })).status).toBe(201)
  })

  it('409 CATALOG_KEY_TAKEN con una key repetida', async () => {
    const { admin } = await scenario()
    await admin.api.post('/admin/catalogs/interests', { key: 'test-tejo', name: 'Tejo', categoryKey: 'deportes' })

    expectError(await admin.api.post('/admin/catalogs/interests', { key: 'test-tejo', name: 'Otro', categoryKey: 'deportes' }), expect, 409, 'CATALOG_KEY_TAKEN')
  })

  it('400 si el "padre" no existe, la key es inválida o reservada, o faltan campos', async () => {
    const { admin } = await scenario()

    const orphan = await admin.api.post('/admin/catalogs/interests', { key: 'test-x', name: 'X', categoryKey: 'no-existe' })
    expectValidationError(orphan, expect)
    expect(orphan.body.details).toEqual([{ path: 'categoryKey', message: 'La categoría no existe' }])
    expectValidationError(await admin.api.post('/admin/catalogs/interests', { key: 'Test X', name: 'X', categoryKey: 'deportes' }), expect)
    expectValidationError(await admin.api.post('/admin/catalogs/universities', { key: 'other', name: 'Otra', shortName: 'O' }), expect)
    expectValidationError(await admin.api.post('/admin/catalogs/universities', { key: 'test-uni', name: 'Sin sigla' }), expect)
    expectValidationError(await admin.api.post('/admin/catalogs/interests', { key: 'test-x', name: 'X', categoryKey: 'deportes', minAge: 10 }), expect)
    expectValidationError(await admin.api.post('/admin/catalogs/interests', { key: 'test-x', name: 'X', categoryKey: 'deportes', _id: UNKNOWN_ID }), expect)
  })
})

describe('PATCH /admin/catalogs/:catalog/:id', () => {
  it('renombra, ordena, desactiva y quita la edad mínima (null); la opción desactivada deja de salir en la app', async () => {
    const { admin, ana } = await scenario()
    const { body: created } = await admin.api.post('/admin/catalogs/interests', { key: 'test-tejo', name: 'Tejo', categoryKey: 'deportes', minAge: 18 })

    const res = await admin.api.patch(`/admin/catalogs/interests/${created.id}`, { name: 'Tejo criollo', order: 3, active: false, minAge: null })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: created.id, key: 'test-tejo', name: 'Tejo criollo', order: 3, active: false, minAge: null })
    expect(publicInterestKeys((await ana.api.get('/catalogs')).body)).not.toContain('test-tejo')
  })

  it('la key y el padre no se pueden cambiar; un body vacío es 400; 404 si no existe', async () => {
    const { admin } = await scenario()
    const { body: created } = await admin.api.post('/admin/catalogs/interests', { key: 'test-tejo', name: 'Tejo', categoryKey: 'deportes' })
    const path = `/admin/catalogs/interests/${created.id}`

    expectValidationError(await admin.api.patch(path, { key: 'test-otra' }), expect)
    expectValidationError(await admin.api.patch(path, { categoryKey: 'musica' }), expect)
    expectValidationError(await admin.api.patch(path, {}), expect)
    expectError(await admin.api.patch(`/admin/catalogs/interests/${UNKNOWN_ID}`, { name: 'X' }), expect, 404, 'NOT_FOUND')
    expectValidationError(await admin.api.patch('/admin/catalogs/interests/abc', { name: 'X' }), expect)
  })
})
