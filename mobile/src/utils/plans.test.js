import {
  dateRangeFor, formValuesFrom, formatDistance, formatPrice, formatSchedule, formatSpots, planChanges, priceRangeLabel, radiusLabel,
  toPlanPayload, validatePlanForm
} from './plans.js'

// Fechas armadas con la hora LOCAL del teléfono (los textos se muestran en hora local).
const local = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute)
const NOW = local(12, 12)

const PLAN = Object.freeze({
  id: 'p1',
  title: 'Partido de fútbol',
  description: 'Traer camiseta',
  startsAt: local(25, 18).toISOString(),
  endsAt: local(25, 20).toISOString(),
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 150,
  interests: ['futbol']
})

const validValues = (overrides = {}) => ({ ...formValuesFrom(PLAN), ...overrides })

describe('textos', () => {
  it('formatPrice: gratis o pesos con separador de miles', () => {
    expect(formatPrice(0)).toBe('Gratis')
    expect(formatPrice(150)).toBe('$ 150')
    expect(formatPrice(1500)).toBe('$ 1.500')
    expect(formatPrice(100000)).toBe('$ 100.000')
  })

  it('priceRangeLabel arma el texto con los límites que manda el back', () => {
    expect(priceRangeLabel({ key: 'free', min: 0, max: 0 })).toBe('Gratis')
    expect(priceRangeLabel({ key: 'low', min: 1, max: 500 })).toBe('$ 1 a $ 500')
    expect(priceRangeLabel({ key: 'mid', min: 501, max: 1000 })).toBe('$ 501 a $ 1.000')
    expect(priceRangeLabel({ key: 'high', min: 1001, max: null })).toBe('Más de $ 1.000')
  })

  it('radiusLabel y formatDistance', () => {
    expect(radiusLabel(0.5)).toBe('500 m')
    expect(radiusLabel(10)).toBe('10 km')
    expect(formatDistance(4)).toBe('a 10 m')
    expect(formatDistance(347)).toBe('a 350 m')
    expect(formatDistance(2440)).toBe('a 2,4 km')
    expect(formatDistance(12600)).toBe('a 13 km')
  })

  it('formatSpots: lugares, lleno o sin límite', () => {
    expect(formatSpots({ capacity: 10, availableSpots: 3, isFull: false })).toBe('Quedan 3 lugares')
    expect(formatSpots({ capacity: 10, availableSpots: 1, isFull: false })).toBe('Queda 1 lugar')
    expect(formatSpots({ capacity: 10, availableSpots: 0, isFull: true })).toBe('Lleno')
    expect(formatSpots({ capacity: null, availableSpots: null, isFull: false })).toBe('Sin límite de cupo')
  })

  it('formatSchedule: un día, o los dos si termina otro día (campamento)', () => {
    expect(formatSchedule(local(25, 18).toISOString(), local(25, 20, 30).toISOString())).toBe('dom 25/10 · 18:00 a 20:30')
    expect(formatSchedule(local(23, 9).toISOString(), local(25, 17).toISOString())).toBe('vie 23/10 · 09:00 a dom 25/10 · 17:00')
    expect(formatSchedule('nope', 'nope')).toBe('')
  })
})

describe('dateRangeFor (filtro de fecha predefinido)', () => {
  it('"any" no filtra', () => {
    expect(dateRangeFor('any', NOW)).toEqual({})
  })

  it('"today" llega hasta el final del día local', () => {
    expect(dateRangeFor('today', NOW)).toEqual({ to: new Date(2026, 9, 12, 23, 59, 59, 999).toISOString() })
  })

  it('"week" y "month" son 7 y 30 días desde ahora', () => {
    expect(dateRangeFor('week', NOW)).toEqual({ to: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() })
    expect(dateRangeFor('month', NOW)).toEqual({ to: new Date(NOW.getTime() + 30 * 86_400_000).toISOString() })
  })
})

describe('formValuesFrom', () => {
  it('un plan nuevo arranca vacío, gratis y con cupo a definir', () => {
    expect(formValuesFrom(null)).toEqual({
      title: '', description: '', startsAt: null, endsAt: null, locationLabel: '', coordinates: null, isUnlimited: false, capacity: '', price: '0', interests: []
    })
  })

  it('un plan guardado llena el formulario; capacity null es "Cupo ilimitado"', () => {
    expect(formValuesFrom(PLAN)).toMatchObject({ title: 'Partido de fútbol', capacity: '10', isUnlimited: false, price: '150', coordinates: [-56.16, -34.9] })
    expect(formValuesFrom({ ...PLAN, capacity: null, description: null })).toMatchObject({ capacity: '', isUnlimited: true, description: '' })
  })
})

describe('validatePlanForm', () => {
  const errorsFor = (overrides, options) => validatePlanForm(validValues(overrides), { now: NOW, ...options })

  it('un formulario completo no tiene errores', () => {
    expect(errorsFor({})).toEqual({})
  })

  it.each([
    ['title', { title: 'ab' }],
    ['title', { title: 'x'.repeat(101) }],
    ['description', { description: 'x'.repeat(2001) }],
    ['startsAt', { startsAt: null }],
    ['startsAt', { startsAt: local(12, 11), endsAt: local(12, 14) }],
    ['endsAt', { endsAt: null }],
    ['endsAt', { endsAt: local(25, 18) }],
    ['endsAt', { endsAt: local(25, 17) }],
    ['endsAt', { startsAt: local(20, 18), endsAt: local(27, 18, 1) }],
    ['coordinates', { coordinates: null }],
    ['locationLabel', { locationLabel: '   ' }],
    ['locationLabel', { locationLabel: 'x'.repeat(121) }],
    ['capacity', { capacity: '' }],
    ['capacity', { capacity: '0' }],
    ['capacity', { capacity: '501' }],
    ['capacity', { capacity: '2.5' }],
    ['capacity', { capacity: 'diez' }],
    ['price', { price: '' }],
    ['price', { price: '-5' }],
    ['price', { price: '99.5' }],
    ['price', { price: '100001' }],
    ['interests', { interests: [] }]
  ])('marca %s con %j', (field, overrides) => {
    expect(Object.keys(errorsFor(overrides))).toEqual([field])
  })

  it('acepta un plan de exactamente 7 días', () => {
    expect(errorsFor({ startsAt: local(20, 18), endsAt: local(27, 18) })).toEqual({})
  })

  it('con "Cupo ilimitado" no se exige un número de cupo', () => {
    expect(errorsFor({ isUnlimited: true, capacity: '' })).toEqual({})
  })

  it('al editar sin cambiar el inicio no exige que sea futuro (plan en curso)', () => {
    const started = { startsAt: local(12, 11), endsAt: local(12, 14) }

    expect(errorsFor(started, { startChanged: false })).toEqual({})
    expect(Object.keys(errorsFor(started, { startChanged: true }))).toEqual(['startsAt'])
  })
})

describe('toPlanPayload', () => {
  it('arma el body de POST /plans: fechas ISO con zona, coordenadas [lng, lat] y números', () => {
    expect(toPlanPayload(validValues({ title: '  Partido  ', locationLabel: ' Cancha ' }))).toEqual({
      title: 'Partido',
      description: 'Traer camiseta',
      startsAt: PLAN.startsAt,
      endsAt: PLAN.endsAt,
      location: { label: 'Cancha', type: 'Point', coordinates: [-56.16, -34.9] },
      capacity: 10,
      price: 150,
      interests: ['futbol']
    })
  })

  it('cupo ilimitado → capacity null; sin descripción no manda el campo', () => {
    const payload = toPlanPayload(validValues({ isUnlimited: true, capacity: '25', description: '  ' }))

    expect(payload.capacity).toBeNull()
    expect(payload).not.toHaveProperty('description')
  })
})

describe('planChanges (PATCH parcial)', () => {
  it('sin cambios devuelve un objeto vacío', () => {
    expect(planChanges(PLAN, validValues())).toEqual({})
  })

  it('devuelve solo lo que cambió', () => {
    expect(planChanges(PLAN, validValues({ title: 'Fútbol 5', price: '0' }))).toEqual({ title: 'Fútbol 5', price: 0 })
  })

  it('pasar a cupo ilimitado manda capacity null; volver a un número manda el número', () => {
    expect(planChanges(PLAN, validValues({ isUnlimited: true }))).toEqual({ capacity: null })
    expect(planChanges({ ...PLAN, capacity: null }, validValues({ isUnlimited: false, capacity: '30' }))).toEqual({ capacity: 30 })
  })

  it('mover el pin o cambiar el nombre del lugar manda la ubicación completa', () => {
    expect(planChanges(PLAN, validValues({ coordinates: [-56.17, -34.91] }))).toEqual({
      location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.17, -34.91] }
    })
  })

  it('fechas, intereses y borrar la descripción', () => {
    const changes = planChanges(PLAN, validValues({ endsAt: local(25, 21), interests: ['futbol', 'cine'], description: '' }))

    expect(changes).toEqual({ endsAt: local(25, 21).toISOString(), interests: ['futbol', 'cine'], description: '' })
  })
})
