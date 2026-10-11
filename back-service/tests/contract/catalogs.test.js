// Contrato HTTP de GET /catalogs: lo que la app usa para armar los selectores.
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { Career, Interest, University } from '../../src/modules/catalogs/index.js'
import { useTestDb } from '../helpers/db.js'
import { buildTestModules, registerViaHttp } from '../helpers/modules.js'

useTestDb()

async function setup () {
  const modules = buildTestModules()
  const { accessToken } = await registerViaHttp(request, modules.app)
  const get = () => request(modules.app).get('/internal/catalogs').set('Authorization', `Bearer ${accessToken}`)
  return { ...modules, get }
}

describe('GET /catalogs', () => {
  it('requiere sesión', async () => {
    const { app } = await setup()

    expect((await request(app).get('/internal/catalogs')).status).toBe(401)
  })

  it('devuelve intereses por categoría, universidades con sus carreras y ciudades con sus barrios', async () => {
    const { get } = await setup()

    const res = await get()

    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['cities', 'interestCategories', 'universities', 'version'])
    expect(res.body.version).toMatch(/^[0-9a-f]{12}$/)
    expect(res.body.interestCategories.map((category) => category.key)).toEqual([
      'deportes', 'salidas-y-gastronomia', 'musica', 'arte-y-cultura', 'entretenimiento', 'aire-libre', 'estudio-y-carrera', 'comunidad'
    ])
    expect(res.body.interestCategories[0].interests).toContainEqual({ key: 'padel', name: 'Pádel' })
    expect(res.body.universities.map((university) => university.key)).toEqual(['um', 'ort', 'ucu', 'udelar', 'ude', 'uclaeh', 'utec'])
    const um = res.body.universities.find((university) => university.key === 'um')
    expect(um.careers).toContainEqual({ key: 'ingenieria-en-informatica', name: 'Ingeniería en Informática', group: 'Facultad de Ingeniería' })
    expect(res.body.cities).toHaveLength(1)
    expect(res.body.cities[0].neighborhoods).toHaveLength(62)
  })

  it('las opciones con edad mínima la traen (minAge); el resto no', async () => {
    const { get } = await setup()

    const { body } = await get()

    const nightlife = body.interestCategories.find((category) => category.key === 'salidas-y-gastronomia').interests
    expect(nightlife.find((interest) => interest.key === 'bares-y-cervecerias')).toEqual({ key: 'bares-y-cervecerias', name: 'Bares y cervecerías', minAge: 18 })
    expect(nightlife.find((interest) => interest.key === 'asado')).toEqual({ key: 'asado', name: 'Asado' })
  })

  it('"Otra" no está en la respuesta: es una opción reservada que agrega la app', async () => {
    const { get } = await setup()

    expect(JSON.stringify((await get()).body)).not.toContain('"other"')
  })

  it('no expone campos internos', async () => {
    const { get } = await setup()

    expect(JSON.stringify((await get()).body)).not.toMatch(/active|"order"|createdAt|_id|ineCode|department/)
  })

  it('lo desactivado desaparece y la versión cambia (después de que vence la caché)', async () => {
    const { get, catalogService } = await setup()
    const before = (await get()).body
    await Promise.all([
      University.updateOne({ key: 'utec' }, { active: false }),
      Career.updateOne({ universityKey: 'um', key: 'economia' }, { active: false }),
      Interest.updateOne({ key: 'padel' }, { active: false })
    ])
    catalogService.invalidate()

    try {
      const after = (await get()).body

      expect(after.universities.map((university) => university.key)).not.toContain('utec')
      expect(after.universities.find((university) => university.key === 'um').careers.map((career) => career.key)).not.toContain('economia')
      expect(after.interestCategories[0].interests.map((interest) => interest.key)).not.toContain('padel')
      expect(after.version).not.toBe(before.version)
    } finally {
      await Promise.all([
        University.updateOne({ key: 'utec' }, { active: true }),
        Career.updateOne({ universityKey: 'um', key: 'economia' }, { active: true }),
        Interest.updateOne({ key: 'padel' }, { active: true })
      ])
      catalogService.invalidate()
    }
  })

  it('se puede cachear unos minutos en la app', async () => {
    const { get } = await setup()

    expect((await get()).headers['cache-control']).toBe('private, max-age=300')
  })
})
