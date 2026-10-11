// Datos iniciales de los catálogos (catalogs/), su carga y la migración de los usuarios existentes.
import { describe, expect, it } from 'vitest'
import { buildCatalogDocuments, syncCatalogs } from '../../catalogs/index.js'
import { getConnection } from '../../src/adapters/db/index.js'
import { KEY_PATTERN, OTHER } from '../../src/shared/catalog-keys.js'
import { useTestDb } from '../helpers/db.js'

const catalogs = Object.fromEntries(buildCatalogDocuments().map(({ collection, docs }) => [collection, docs]))
const raw = (name) => getConnection().db.collection(name)

describe('datos iniciales (sin base de datos)', () => {
  it('todas las keys tienen forma válida y ninguna es la reservada "other"', () => {
    for (const [name, docs] of Object.entries(catalogs)) {
      for (const { key } of docs) {
        expect(KEY_PATTERN.test(key), `${name}: ${key}`).toBe(true)
        expect(key, name).not.toBe(OTHER)
      }
    }
  })

  it('las keys son únicas dentro de su ámbito (global, por universidad o por ciudad)', () => {
    const duplicated = (docs, scope) => {
      const seen = new Set()
      return docs.filter((doc) => { const id = `${scope(doc)}/${doc.key}`; return seen.has(id) || !seen.add(id) })
    }
    expect(duplicated(catalogs.interestCategories, () => '')).toEqual([])
    expect(duplicated(catalogs.interests, () => '')).toEqual([])
    expect(duplicated(catalogs.universities, () => '')).toEqual([])
    expect(duplicated(catalogs.careers, (doc) => doc.universityKey)).toEqual([])
    expect(duplicated(catalogs.cities, () => '')).toEqual([])
    expect(duplicated(catalogs.neighborhoods, (doc) => doc.cityKey)).toEqual([])
  })

  it('cada carrera pertenece a una universidad que existe, cada barrio a una ciudad y cada interés a una categoría', () => {
    const universities = new Set(catalogs.universities.map((item) => item.key))
    const cities = new Set(catalogs.cities.map((item) => item.key))
    const categories = new Set(catalogs.interestCategories.map((item) => item.key))

    expect(catalogs.careers.filter((item) => !universities.has(item.universityKey))).toEqual([])
    expect(catalogs.neighborhoods.filter((item) => !cities.has(item.cityKey))).toEqual([])
    expect(catalogs.interests.filter((item) => !categories.has(item.categoryKey))).toEqual([])
  })

  it('toda universidad tiene carreras y toda categoría tiene intereses', () => {
    for (const university of catalogs.universities) {
      expect(catalogs.careers.filter((item) => item.universityKey === university.key).length, university.key).toBeGreaterThan(0)
    }
    for (const category of catalogs.interestCategories) {
      expect(catalogs.interests.filter((item) => item.categoryKey === category.key).length, category.key).toBeGreaterThan(0)
    }
  })

  it('los nombres están limpios: sin espacios sobrantes ni vacíos, y no se repiten dentro de una universidad', () => {
    for (const [name, docs] of Object.entries(catalogs)) {
      for (const doc of docs) {
        expect(doc.name, `${name}: ${doc.key}`).toBe(doc.name.trim().replace(/\s+/g, ' '))
        expect(doc.name.length, `${name}: ${doc.key}`).toBeGreaterThan(0)
      }
    }
    const names = catalogs.careers.map((career) => `${career.universityKey}/${career.name.toLowerCase()}`)
    expect(names.length).toBe(new Set(names).size)
  })

  it('las carreras son de grado: sin tecnicaturas, tecnólogos, ciclos, cursos, diplomas ni posgrados', () => {
    const notGrado = /\b(tecnicatura|tecn[oó]logo|t[eé]cnico|ciclo|curso|diplom|maestr[ií]a|posgrado|postgrado|doctorado en educaci[oó]n)\b/i
    expect(catalogs.careers.filter((career) => notGrado.test(career.name)).map((career) => career.name)).toEqual([])
  })

  it('la cantidad de carreras por universidad coincide con lo relevado en los sitios oficiales', () => {
    const count = (key) => catalogs.careers.filter((career) => career.universityKey === key).length
    expect({ um: count('um'), ort: count('ort'), ucu: count('ucu'), udelar: count('udelar'), ude: count('ude'), uclaeh: count('uclaeh'), utec: count('utec') })
      .toEqual({ um: 26, ort: 30, ucu: 53, udelar: 102, ude: 21, uclaeh: 6, utec: 12 })
  })

  it('carreras clave están con el nombre oficial', () => {
    const has = (universityKey, name) => catalogs.careers.some((career) => career.universityKey === universityKey && career.name === name)
    expect(has('um', 'Ingeniería en Informática')).toBe(true)
    expect(has('ort', 'Ingeniería en Sistemas')).toBe(true)
    expect(has('ort', 'Licenciatura en Comunicación orientación Audiovisual')).toBe(true)
    expect(has('ucu', 'Medicina')).toBe(true)
    expect(has('udelar', 'Doctor en Medicina')).toBe(true)
    expect(has('udelar', 'Licenciatura en Ciencias de la Atmósfera')).toBe(true)
    expect(has('ude', 'Ingeniero Agrónomo')).toBe(true)
    expect(has('utec', 'Ingeniería en Mecatrónica')).toBe(true)
    expect(has('uclaeh', 'Abogacía y Notariado')).toBe(true)
  })

  it('los barrios son las 62 áreas del INE (códigos 1 a 62, sin repetir)', () => {
    const codes = catalogs.neighborhoods.map((item) => item.ineCode).sort((a, b) => a - b)

    expect(codes).toEqual(Array.from({ length: 62 }, (_, i) => i + 1))
    expect(catalogs.neighborhoods.find((item) => item.key === 'pocitos')).toMatchObject({ name: 'Pocitos', ineCode: 8 })
  })

  it('los intereses con edad mínima la tienen entera y entre 16 y 99', () => {
    for (const item of catalogs.interests.filter((interest) => interest.minAge !== undefined)) {
      expect(Number.isInteger(item.minAge), item.key).toBe(true)
      expect(item.minAge).toBeGreaterThanOrEqual(16)
    }
    expect(catalogs.interests.filter((item) => item.minAge).map((item) => item.key)).toEqual(['bares-y-cervecerias', 'salir-a-bailar'])
  })

  it('las keys de los seeds viejos siguen existiendo (los usuarios existentes las conservan)', () => {
    const keys = catalogs.interests.map((item) => item.key)
    for (const old of ['futbol', 'running', 'estudio', 'musica', 'cine', 'juegos-de-mesa']) expect(keys).toContain(old)
  })
})

describe('syncCatalogs', () => {
  useTestDb()

  it('la migración dejó todo cargado', async () => {
    for (const [name, docs] of Object.entries(catalogs)) expect(await raw(name).countDocuments(), name).toBe(docs.length)
  })

  it('es idempotente: volver a correrlo no inserta nada', async () => {
    const inserted = await syncCatalogs(getConnection().db)

    expect(Object.values(inserted).every((count) => count === 0)).toBe(true)
  })

  it('solo inserta lo que falta y NUNCA pisa lo que el admin editó', async () => {
    await raw('interests').updateOne({ key: 'futbol' }, { $set: { name: 'Fútbol (editado)', active: false, order: 99 } })
    await raw('universities').deleteOne({ key: 'utec' })

    const inserted = await syncCatalogs(getConnection().db)

    expect(inserted.universities).toBe(1)
    expect(inserted.interests).toBe(0)
    expect(await raw('interests').findOne({ key: 'futbol' })).toMatchObject({ name: 'Fútbol (editado)', active: false, order: 99 })
    expect(await raw('universities').findOne({ key: 'utec' })).toMatchObject({ shortName: 'UTEC', active: true })
  })

  it('no toca las filas que agregó el admin', async () => {
    await raw('universities').insertOne({ key: 'test-instituto', name: 'Instituto nuevo', shortName: 'IN', order: 50, active: true })

    await syncCatalogs(getConnection().db)

    expect(await raw('universities').countDocuments({ key: 'test-instituto' })).toBe(1)
    await raw('universities').deleteOne({ key: 'test-instituto' })
  })
})

describe('migración users-catalog-references', () => {
  useTestDb()

  async function migrateOldUsers (users) {
    const { up, down } = await import('../../migrations/20261011190200-users-catalog-references.js')
    const { db } = getConnection()
    await down(db) // validador anterior: acepta texto libre
    await raw('users').deleteMany({})
    await raw('users').insertMany(users.map((user, i) => ({ email: `u${i}@test.junte`, passwordHash: 'x', role: 'user', status: 'active', ...user })))
    await up(db)
    return (await raw('users').find({}).sort({ email: 1 }).toArray())
  }

  it('convierte el texto libre a keys, sin importar mayúsculas ni tildes', async () => {
    const [a, b, c] = await migrateOldUsers([
      { university: 'Universidad de Montevideo', city: 'MONTEVIDEO', neighborhood: 'Punta Carretas', interests: ['futbol', 'cine'] },
      { university: 'ort', city: 'Montevideo', neighborhood: 'cordón' },
      { university: 'Universidad ORT Uruguay', city: 'montevideo', neighborhood: 'PARQUE RODÓ' }
    ])

    expect(a).toMatchObject({ university: 'um', city: 'montevideo', neighborhood: 'punta-carretas', interests: ['futbol', 'cine'] })
    expect(b).toMatchObject({ university: 'ort', city: 'montevideo', neighborhood: 'cordon' })
    expect(c).toMatchObject({ university: 'ort', neighborhood: 'parque-rodo' })
  })

  it('lo que no está en el catálogo pasa a "Otra"; un barrio sin ciudad del catálogo se quita', async () => {
    const [harvard, canelones, unknownBarrio] = await migrateOldUsers([
      { university: 'Harvard', city: 'Canelones', neighborhood: 'Las Piedras' },
      { city: 'Canelones', neighborhood: 'Pando' },
      { city: 'Montevideo', neighborhood: 'Narnia' }
    ])

    expect(harvard).toMatchObject({ university: 'other', city: 'other' })
    expect(harvard).not.toHaveProperty('neighborhood')
    expect(canelones).toMatchObject({ city: 'other' })
    expect(canelones).not.toHaveProperty('neighborhood')
    expect(unknownBarrio).toMatchObject({ city: 'montevideo', neighborhood: 'other' })
  })

  it('quita los intereses que ya no existen y respeta el máximo; no inventa campos', async () => {
    const [user, bare] = await migrateOldUsers([
      { interests: ['futbol', 'paracaidismo', 'cine'] },
      { name: 'Sin datos' }
    ])

    expect(user.interests).toEqual(['futbol', 'cine'])
    expect(bare).not.toHaveProperty('university')
    expect(bare).not.toHaveProperty('interests')
    expect(bare).toMatchObject({ name: 'Sin datos' })
  })

  it('después de migrar, el validador exige keys', async () => {
    await migrateOldUsers([{}])

    await expect(raw('users').updateOne({ email: 'u0@test.junte' }, { $set: { university: 'Universidad de Montevideo' } }))
      .rejects.toMatchObject({ code: 121 })
  })
})
