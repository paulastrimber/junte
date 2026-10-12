import { describe, expect, it } from 'vitest'
import { buildPublicCatalog, checkInterestReferences, checkProfileReferences } from './catalog.rules.js'

const snapshot = {
  interestCategories: [
    { key: 'deportes', name: 'Deportes', order: 1, active: true },
    { key: 'salidas', name: 'Salidas', order: 2, active: true },
    { key: 'viejo', name: 'Categoría apagada', order: 3, active: false }
  ],
  interests: [
    { key: 'futbol', name: 'Fútbol', categoryKey: 'deportes', order: 1, active: true },
    { key: 'rugby', name: 'Rugby', categoryKey: 'deportes', order: 2, active: false },
    { key: 'bares', name: 'Bares', categoryKey: 'salidas', order: 1, active: true, minAge: 18 },
    { key: 'oculto', name: 'Oculto', categoryKey: 'viejo', order: 1, active: true }
  ],
  universities: [
    { key: 'um', name: 'Universidad de Montevideo', shortName: 'UM', order: 1, active: true },
    { key: 'ort', name: 'Universidad ORT Uruguay', shortName: 'ORT', order: 2, active: true },
    { key: 'cerrada', name: 'Universidad cerrada', shortName: 'UC', order: 3, active: false }
  ],
  careers: [
    { key: 'informatica', name: 'Ingeniería en Informática', universityKey: 'um', group: 'Facultad de Ingeniería', order: 1, active: true },
    { key: 'sistemas', name: 'Ingeniería en Sistemas', universityKey: 'ort', group: 'Facultad de Ingeniería', order: 1, active: true },
    { key: 'vieja', name: 'Carrera vieja', universityKey: 'um', group: 'Otra', order: 2, active: false }
  ],
  cities: [{ key: 'montevideo', name: 'Montevideo', department: 'Montevideo', order: 1, active: true }],
  neighborhoods: [
    { key: 'pocitos', name: 'Pocitos', cityKey: 'montevideo', order: 1, active: true },
    { key: 'cordon', name: 'Cordón', cityKey: 'montevideo', order: 2, active: true }
  ]
}

const check = (next, { current = {}, age = 25 } = {}) => checkProfileReferences(snapshot, { current, next, age })
const paths = (details) => details.map((detail) => detail.path)

describe('checkProfileReferences', () => {
  it('un perfil sin referencias es válido', () => {
    expect(check({})).toEqual([])
  })

  it('acepta universidad, carrera de esa universidad, ciudad, barrio de esa ciudad e intereses', () => {
    const next = { university: 'um', career: 'informatica', city: 'montevideo', neighborhood: 'pocitos', interests: ['futbol'] }

    expect(check(next)).toEqual([])
  })

  describe('"Otra"', () => {
    it('vale como universidad, carrera, ciudad y barrio', () => {
      expect(check({ university: 'other', city: 'other' })).toEqual([])
      expect(check({ university: 'um', career: 'other' })).toEqual([])
      expect(check({ city: 'montevideo', neighborhood: 'other' })).toEqual([])
    })

    it('no vale como interés (no es una fila del catálogo)', () => {
      expect(paths(check({ interests: ['other'] }))).toEqual(['interests'])
    })
  })

  describe('universidad', () => {
    it('rechaza una que no existe', () => {
      expect(check({ university: 'harvard' })).toEqual([{ path: 'university', message: expect.stringMatching(/no existe/) }])
    })

    it('rechaza una desactivada, salvo que el usuario ya la tuviera', () => {
      expect(paths(check({ university: 'cerrada' }))).toEqual(['university'])
      expect(check({ university: 'cerrada' }, { current: { university: 'cerrada' } })).toEqual([])
    })
  })

  describe('carrera', () => {
    it('rechaza una carrera de otra universidad', () => {
      expect(check({ university: 'um', career: 'sistemas' })).toEqual([{ path: 'career', message: expect.stringMatching(/esa universidad/) }])
    })

    it('exige universidad', () => {
      expect(check({ career: 'informatica' })).toEqual([{ path: 'career', message: expect.stringMatching(/universidad/) }])
    })

    it('con universidad "Otra" no hay carreras para elegir', () => {
      expect(paths(check({ university: 'other', career: 'informatica' }))).toEqual(['career'])
      expect(paths(check({ university: 'other', career: 'other' }))).toEqual(['career'])
    })

    it('rechaza una desactivada salvo que ya la tuviera', () => {
      expect(paths(check({ university: 'um', career: 'vieja' }))).toEqual(['career'])
      expect(check({ university: 'um', career: 'vieja' }, { current: { university: 'um', career: 'vieja' } })).toEqual([])
    })
  })

  describe('ciudad y barrio', () => {
    it('rechaza una ciudad inexistente', () => {
      expect(paths(check({ city: 'atlantida' }))).toEqual(['city'])
    })

    it('el barrio exige ciudad del catálogo', () => {
      expect(paths(check({ neighborhood: 'pocitos' }))).toEqual(['neighborhood'])
      expect(paths(check({ city: 'other', neighborhood: 'pocitos' }))).toEqual(['neighborhood'])
    })

    it('rechaza un barrio que no existe', () => {
      expect(paths(check({ city: 'montevideo', neighborhood: 'narnia' }))).toEqual(['neighborhood'])
    })
  })

  describe('intereses', () => {
    it('rechaza uno que no existe', () => {
      expect(check({ interests: ['paracaidismo'] })).toEqual([{ path: 'interests', message: expect.stringContaining('paracaidismo') }])
    })

    it('rechaza uno desactivado o de una categoría desactivada, salvo que ya lo tuviera', () => {
      expect(paths(check({ interests: ['rugby'] }))).toEqual(['interests'])
      expect(paths(check({ interests: ['oculto'] }))).toEqual(['interests'])
      expect(check({ interests: ['rugby'] }, { current: { interests: ['rugby'] } })).toEqual([])
    })

    it('respeta la edad mínima: un menor no puede elegir "Bares"', () => {
      expect(check({ interests: ['bares'] }, { age: 17 })).toEqual([{ path: 'interests', message: expect.stringMatching(/18/) }])
      expect(check({ interests: ['bares'] }, { age: 18 })).toEqual([])
    })

    it('sin fecha de nacimiento no se puede elegir una opción con edad mínima', () => {
      expect(paths(check({ interests: ['bares'] }, { age: null }))).toEqual(['interests'])
    })

    it('la edad mínima también corta lo que ya tenía si baja la edad (se corrige la fecha de nacimiento)', () => {
      expect(paths(check({ interests: ['bares'] }, { current: { interests: ['bares'] }, age: 16 }))).toEqual(['interests'])
    })
  })

  it('informa todos los problemas a la vez', () => {
    const details = check({ university: 'harvard', city: 'atlantida', interests: ['paracaidismo'] })

    expect(paths(details).sort()).toEqual(['city', 'interests', 'university'])
  })
})

describe('checkInterestReferences (intereses de un plan)', () => {
  it('acepta intereses existentes y activos', () => {
    expect(checkInterestReferences(snapshot, { keys: ['futbol'], age: 20 })).toEqual([])
  })

  it('rechaza inexistentes y desactivados (un plan nuevo no "conserva" nada)', () => {
    expect(paths(checkInterestReferences(snapshot, { keys: ['paracaidismo', 'rugby'], age: 20 }))).toEqual(['interests', 'interests'])
  })

  it('al editar un plan conserva un interés que ya tenía aunque se haya desactivado', () => {
    expect(checkInterestReferences(snapshot, { keys: ['rugby'], kept: ['rugby'], age: 20 })).toEqual([])
  })

  it('respeta la edad mínima con la edad del creador', () => {
    expect(paths(checkInterestReferences(snapshot, { keys: ['bares'], age: 17 }))).toEqual(['interests'])
    expect(checkInterestReferences(snapshot, { keys: ['bares'], age: 18 })).toEqual([])
  })
})

describe('buildPublicCatalog', () => {
  const catalog = buildPublicCatalog(snapshot)

  it('solo incluye lo activo, anidado y en orden', () => {
    expect(catalog.interestCategories.map((category) => category.key)).toEqual(['deportes', 'salidas'])
    expect(catalog.interestCategories[0].interests).toEqual([{ key: 'futbol', name: 'Fútbol' }])
    expect(catalog.universities.map((university) => university.key)).toEqual(['um', 'ort'])
    expect(catalog.universities[0].careers).toEqual([{ key: 'informatica', name: 'Ingeniería en Informática', group: 'Facultad de Ingeniería' }])
    expect(catalog.cities[0]).toMatchObject({ key: 'montevideo', name: 'Montevideo' })
    expect(catalog.cities[0].neighborhoods.map((neighborhood) => neighborhood.key)).toEqual(['pocitos', 'cordon'])
  })

  it('expone minAge solo donde existe', () => {
    expect(catalog.interestCategories[1].interests[0]).toEqual({ key: 'bares', name: 'Bares', minAge: 18 })
  })

  it('no filtra campos internos', () => {
    const raw = JSON.stringify(catalog)

    expect(raw).not.toMatch(/active|order|createdAt|_id|ineCode|department/)
  })

  it('la versión cambia cuando cambia el contenido y es estable si no', () => {
    const edited = structuredClone(snapshot)
    edited.interests[0].name = 'Fútbol 5'

    expect(buildPublicCatalog(snapshot).version).toBe(catalog.version)
    expect(buildPublicCatalog(edited).version).not.toBe(catalog.version)
  })

  it('desactivar algo en el admin lo saca del catálogo público y cambia la versión', () => {
    const edited = structuredClone(snapshot)
    edited.universities[0].active = false

    const next = buildPublicCatalog(edited)

    expect(next.universities.map((university) => university.key)).toEqual(['ort'])
    expect(next.version).not.toBe(catalog.version)
  })
})
