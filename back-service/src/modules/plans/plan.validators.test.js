import { describe, expect, it } from 'vitest'
import { createPlanBody, listPlansQuery, planIdParams, setPlanPhotoBody, updatePlanBody } from './plan.validators.js'

const valid = (overrides = {}) => ({
  title: 'Partido de fútbol',
  description: 'Actividad recreativa para estudiantes',
  startsAt: '2026-10-25T18:00:00-03:00',
  endsAt: '2026-10-25T20:00:00-03:00',
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 150,
  interests: ['futbol'],
  ...overrides
})

const without = (field) => {
  const { [field]: _omitted, ...rest } = valid()
  return rest
}

describe('POST /plans', () => {
  it('acepta un plan completo y convierte las fechas (con zona) a Date', () => {
    const result = createPlanBody.safeParse(valid({ title: '  Partido de fútbol  ' }))

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      ...valid(),
      startsAt: new Date('2026-10-25T21:00:00.000Z'),
      endsAt: new Date('2026-10-25T23:00:00.000Z'),
      checkInRadiusMeters: 150
    })
  })

  it('description, price y capacity son opcionales: gratis y sin límite de cupo por defecto', () => {
    const { description, price, capacity, ...body } = valid()

    const result = createPlanBody.safeParse(body)

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ price: 0, capacity: null })
    expect(result.data).not.toHaveProperty('description')
  })

  it('capacity null es cupo ilimitado', () => {
    expect(createPlanBody.safeParse(valid({ capacity: null })).data.capacity).toBeNull()
  })

  it('location.type es opcional pero solo puede ser Point', () => {
    const { type, ...location } = valid().location

    expect(createPlanBody.safeParse(valid({ location })).data.location.type).toBe('Point')
    expect(createPlanBody.safeParse(valid({ location: { ...location, type: 'Polygon' } })).success).toBe(false)
  })

  it.each(['title', 'startsAt', 'endsAt', 'location', 'interests'])('%s es obligatorio', (field) => {
    expect(createPlanBody.safeParse(without(field)).success).toBe(false)
  })

  it.each([
    ['creatorId', '665f1c2a9b1e8a0012345678'],
    ['participantCount', 3],
    ['university', 'um'],
    ['status', 'closed'],
    ['photoKey', 'plans/x/y.jpg'],
    ['qrNonceHash', 'abc'],
    ['id', '665f1c2a9b1e8a0012345678'],
    ['isFull', false],
    ['availableSpots', 5]
  ])('rechaza el campo solo-backend %s (.strict)', (field, value) => {
    expect(createPlanBody.safeParse(valid({ [field]: value })).success).toBe(false)
    expect(updatePlanBody.safeParse({ title: 'Otro título', [field]: value }).success).toBe(false)
  })

  it.each([
    ['título corto', { title: 'ab' }],
    ['título de solo espacios', { title: '     ' }],
    ['título largo', { title: 'x'.repeat(101) }],
    ['descripción larga', { description: 'x'.repeat(2001) }],
    ['capacity 0', { capacity: 0 }],
    ['capacity negativa', { capacity: -1 }],
    ['capacity decimal', { capacity: 2.5 }],
    ['capacity como texto', { capacity: '10' }],
    ['capacity mayor al máximo', { capacity: 501 }],
    ['price negativo', { price: -1 }],
    ['price decimal', { price: 99.5 }],
    ['price mayor al máximo', { price: 100_001 }],
    ['price null', { price: null }],
    ['fecha sin zona', { startsAt: '2026-10-25T18:00:00' }],
    ['fecha solo día', { endsAt: '2026-10-25' }],
    ['fecha que no existe', { startsAt: '2026-02-30T18:00:00Z' }],
    ['fecha como número', { startsAt: 1790000000000 }],
    ['sin intereses', { interests: [] }],
    ['11 intereses', { interests: Array.from({ length: 11 }, (_, i) => `interes-${i}`) }],
    ['intereses repetidos', { interests: ['futbol', 'futbol'] }],
    ['interés que no es una key', { interests: ['Fútbol'] }],
    ['operador de Mongo', { title: { $ne: null } }],
    ['operador de Mongo en intereses', { interests: [{ $gt: '' }] }]
  ])('rechaza %s', (_label, override) => {
    expect(createPlanBody.safeParse(valid(override)).success).toBe(false)
  })

  describe('location', () => {
    const location = (overrides) => valid({ location: { ...valid().location, ...overrides } })

    it.each([
      ['longitud fuera de rango', { coordinates: [-181, -34.9] }],
      ['latitud fuera de rango', { coordinates: [-56.16, 91] }],
      ['lat y lng como texto', { coordinates: ['-56.16', '-34.9'] }],
      ['un solo número', { coordinates: [-56.16] }],
      ['tres números', { coordinates: [-56.16, -34.9, 10] }],
      ['NaN', { coordinates: [NaN, -34.9] }],
      ['nombre del lugar vacío', { label: '   ' }],
      ['nombre del lugar largo', { label: 'x'.repeat(121) }],
      ['campo desconocido', { altitude: 10 }]
    ])('rechaza %s', (_label, overrides) => {
      expect(createPlanBody.safeParse(location(overrides)).success).toBe(false)
    })

    it('el nombre del lugar es obligatorio', () => {
      const { label, ...rest } = valid().location

      expect(createPlanBody.safeParse(valid({ location: rest })).success).toBe(false)
    })
  })
})

describe('PATCH /plans/:id', () => {
  it('acepta un cambio parcial y no inventa valores por defecto', () => {
    const result = updatePlanBody.safeParse({ title: 'Otro título' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ title: 'Otro título' })
  })

  it('capacity puede pasar a null (ilimitado) o a un número', () => {
    expect(updatePlanBody.safeParse({ capacity: null }).data).toEqual({ capacity: null })
    expect(updatePlanBody.safeParse({ capacity: 25 }).data).toEqual({ capacity: 25 })
  })

  it('rechaza un body vacío y los mismos valores inválidos que al crear', () => {
    expect(updatePlanBody.safeParse({}).success).toBe(false)
    expect(updatePlanBody.safeParse({ capacity: 0 }).success).toBe(false)
    expect(updatePlanBody.safeParse({ location: { label: 'Sin coordenadas' } }).success).toBe(false)
  })
})

describe('params y foto', () => {
  it('el id tiene que ser un ObjectId', () => {
    expect(planIdParams.safeParse({ id: '665f1c2a9b1e8a0012345678' }).success).toBe(true)
    expect(planIdParams.safeParse({ id: 'abc' }).success).toBe(false)
    expect(planIdParams.safeParse({ id: '665F1C2A9B1E8A0012345678' }).success).toBe(false)
  })

  it('la objectKey tiene que colgar de plans/<id>/', () => {
    expect(setPlanPhotoBody.safeParse({ objectKey: 'plans/665f1c2a9b1e8a0012345678/0b7d-4c.jpg' }).success).toBe(true)
    expect(setPlanPhotoBody.safeParse({ objectKey: 'users/665f1c2a9b1e8a0012345678/0b7d-4c.jpg' }).success).toBe(false)
    expect(setPlanPhotoBody.safeParse({ objectKey: 'plans/../../etc/passwd' }).success).toBe(false)
    expect(setPlanPhotoBody.safeParse({ objectKey: 'plans/665f1c2a9b1e8a0012345678/a.jpg', extra: 1 }).success).toBe(false)
  })
})

describe('GET /plans (query)', () => {
  const parse = (query) => listPlansQuery.safeParse(query)

  it('sin parámetros: 20 por página y solo planes con cupo', () => {
    expect(parse({}).data).toEqual({ limit: 20, availability: 'available' })
  })

  it('convierte los valores del query string', () => {
    const result = parse({
      from: '2026-10-20T00:00:00-03:00',
      to: '2026-10-27T00:00:00-03:00',
      university: 'um',
      interests: 'futbol,cine',
      availability: 'full',
      priceRanges: 'free,low',
      near: '-56.1645,-34.9011',
      radiusKm: '2.5',
      limit: '50'
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      from: new Date('2026-10-20T03:00:00.000Z'),
      to: new Date('2026-10-27T03:00:00.000Z'),
      university: 'um',
      interests: ['futbol', 'cine'],
      availability: 'full',
      priceRanges: ['free', 'low'],
      near: [-56.1645, -34.9011],
      radiusKm: 2.5,
      limit: 50
    })
  })

  it.each([
    ['limit 0', { limit: '0' }],
    ['limit mayor a 100', { limit: '101' }],
    ['limit decimal', { limit: '2.5' }],
    ['limit que no es número', { limit: 'muchos' }],
    ['near sin coma', { near: '-56.16' }],
    ['near con texto', { near: 'aca,alla' }],
    ['near con tres valores', { near: '-56.16,-34.9,3' }],
    ['near fuera de rango', { near: '-56.16,-95' }],
    ['near en notación rara', { near: '1e2,0x10' }],
    ['radio menor al mínimo', { near: '-56.16,-34.9', radiusKm: '0.1' }],
    ['radio mayor al máximo', { near: '-56.16,-34.9', radiusKm: '51' }],
    ['radio sin near', { radiusKm: '5' }],
    ['from sin zona', { from: '2026-10-20T00:00:00' }],
    ['to anterior a from', { from: '2026-10-27T00:00:00Z', to: '2026-10-20T00:00:00Z' }],
    ['universidad que no es una key', { university: 'Universidad de Montevideo' }],
    ['interés que no es una key', { interests: 'Fútbol' }],
    ['intereses repetidos', { interests: 'futbol,futbol' }],
    ['lista de intereses vacía', { interests: '' }],
    ['availability desconocida', { availability: 'todos' }],
    ['rango de precio desconocido', { priceRanges: 'free,barato' }],
    ['rangos repetidos', { priceRanges: 'free,free' }],
    ['cursor con caracteres raros', { cursor: 'abc$%' }],
    ['parámetro repetido (llega como arreglo)', { university: ['um', 'ort'] }],
    ['filtro desconocido', { status: 'cancelled' }],
    ['intento de operador', { 'capacity[$gt]': '0' }]
  ])('rechaza %s', (_label, query) => {
    expect(parse(query).success).toBe(false)
  })
})
