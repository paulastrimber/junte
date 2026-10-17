import {
  DEPENDENT_REASON, MAX_INTERESTS, OTHER, careerOptions, cityOptions, dependentFieldState, interestNames, labelFor, neighborhoodOptions, normalizeText, toggleInterest, universityOptions, visibleInterestCategories
} from './catalog.js'

const catalog = {
  version: 'abc',
  interestCategories: [
    { key: 'deportes', name: 'Deportes', interests: [{ key: 'futbol', name: 'Fútbol' }] },
    { key: 'salidas', name: 'Salidas', interests: [{ key: 'cafe', name: 'Café' }, { key: 'bares', name: 'Bares', minAge: 18 }] },
    { key: 'nocturno', name: 'Nocturno', interests: [{ key: 'boliche', name: 'Boliche', minAge: 18 }] }
  ],
  universities: [
    { key: 'um', name: 'Universidad de Montevideo', shortName: 'UM', careers: [{ key: 'economia', name: 'Economía', group: 'Facultad de Economía' }] },
    { key: 'ort', name: 'Universidad ORT Uruguay', shortName: 'ORT', careers: [] }
  ],
  cities: [{ key: 'montevideo', name: 'Montevideo', neighborhoods: [{ key: 'pocitos', name: 'Pocitos' }] }]
}

describe('opciones de los selectores', () => {
  it('universidades con su sigla', () => {
    expect(universityOptions(catalog)).toEqual([
      { key: 'um', label: 'Universidad de Montevideo (UM)' },
      { key: 'ort', label: 'Universidad ORT Uruguay (ORT)' }
    ])
  })

  it('las carreras son las de la universidad elegida; con "Otra" o sin elegir, ninguna', () => {
    expect(careerOptions(catalog, 'um')).toEqual([{ key: 'economia', label: 'Economía', group: 'Facultad de Economía' }])
    expect(careerOptions(catalog, 'ort')).toEqual([])
    expect(careerOptions(catalog, OTHER)).toEqual([])
    expect(careerOptions(catalog, '')).toEqual([])
  })

  it('los barrios son los de la ciudad elegida; con "Otra" o sin elegir, ninguno', () => {
    expect(cityOptions(catalog)).toEqual([{ key: 'montevideo', label: 'Montevideo' }])
    expect(neighborhoodOptions(catalog, 'montevideo')).toEqual([{ key: 'pocitos', label: 'Pocitos' }])
    expect(neighborhoodOptions(catalog, OTHER)).toEqual([])
    expect(neighborhoodOptions(catalog, '')).toEqual([])
  })

  it('sin catálogo cargado no hay opciones (y no rompe)', () => {
    expect(universityOptions(null)).toEqual([])
    expect(careerOptions(null, 'um')).toEqual([])
    expect(cityOptions(null)).toEqual([])
    expect(neighborhoodOptions(null, 'montevideo')).toEqual([])
    expect(visibleInterestCategories(null, 20)).toEqual([])
  })

  it('labelFor: texto del catálogo, "Otra" para other y vacío si no hay valor', () => {
    const options = universityOptions(catalog)
    expect(labelFor(options, 'um')).toBe('Universidad de Montevideo (UM)')
    expect(labelFor(options, OTHER)).toBe('Otra')
    expect(labelFor(options, '')).toBe('')
    expect(labelFor(options, 'desconocida')).toBe('')
  })
})

describe('visibleInterestCategories', () => {
  const keys = (age) => visibleInterestCategories(catalog, age).flatMap((category) => category.interests.map((interest) => interest.key))

  it('un mayor de 18 ve todo', () => {
    expect(keys(18)).toEqual(['futbol', 'cafe', 'bares', 'boliche'])
  })

  it('un menor no ve las opciones con edad mínima, y las categorías que quedan vacías se omiten', () => {
    expect(keys(17)).toEqual(['futbol', 'cafe'])
    expect(visibleInterestCategories(catalog, 17).map((category) => category.key)).toEqual(['deportes', 'salidas'])
  })

  it('sin fecha de nacimiento (edad desconocida) tampoco', () => {
    expect(keys(null)).toEqual(['futbol', 'cafe'])
  })
})

describe('toggleInterest', () => {
  it('agrega, quita y respeta el máximo', () => {
    expect(toggleInterest([], 'cine')).toEqual(['cine'])
    expect(toggleInterest(['cine'], 'cine')).toEqual([])
    const full = Array.from({ length: MAX_INTERESTS }, (_, i) => `interes-${i}`)
    expect(toggleInterest(full, 'otro')).toEqual(full)
    expect(toggleInterest(full, full[0])).toHaveLength(MAX_INTERESTS - 1)
  })
})

describe('normalizeText', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeText('Ingeniería en Informática')).toBe('ingenieria en informatica')
    expect(normalizeText(null)).toBe('')
  })
})

describe('interestNames', () => {
  it('traduce cada key a su nombre del catálogo, en el mismo orden', () => {
    expect(interestNames(['cafe', 'futbol'], catalog)).toEqual(['Café', 'Fútbol'])
  })

  it('sin catálogo, o con una key que ya no existe, usa la key', () => {
    expect(interestNames(['futbol'], null)).toEqual(['futbol'])
    expect(interestNames(['futbol', 'ajedrez'], catalog)).toEqual(['Fútbol', 'ajedrez'])
  })
})

describe('dependentFieldState (carrera según universidad, barrio según ciudad)', () => {
  it.each([
    ['sin elegir arriba', '', [], { disabled: true, reason: DEPENDENT_REASON.NO_PARENT }],
    ['sin elegir arriba aunque haya opciones', '', [{ key: 'a' }], { disabled: true, reason: DEPENDENT_REASON.NO_PARENT }],
    ['"Otra" o sin opciones en el catálogo', OTHER, [], { disabled: true, reason: DEPENDENT_REASON.NO_OPTIONS }],
    ['con opciones', 'um', [{ key: 'economia' }], { disabled: false, reason: null }]
  ])('%s', (_case, parent, options, expected) => {
    expect(dependentFieldState(parent, options)).toEqual(expected)
  })
})
