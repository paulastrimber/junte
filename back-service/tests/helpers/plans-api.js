// Ayudas compartidas por los tests de contrato de /plans y /feed.
import request from 'supertest'
import { MONTEVIDEO } from './factories.js'
import { TEST_PASSWORD, buildTestModules, registerViaHttp } from './modules.js'

// Posterior a la fecha real: los planes que crean las factories nacen "hoy" (reloj real) y el feed solo toma
// los creados hasta el instante de la consulta (reloj fijo de los tests).
export const NOW = new Date('2028-03-01T15:00:00Z')
const HOUR_MS = 60 * 60 * 1000

/** @param {number} hours @returns {Date} `NOW` + horas. */
export const hoursFromNow = (hours) => new Date(NOW.getTime() + hours * HOUR_MS)

// 1° de latitud ≈ 111,2 km.
const METERS_PER_DEGREE_LAT = 111_195

/** Punto a `meters` al norte del centro de Montevideo, como `location` de un plan. */
export const northOf = (meters) => ({
  label: `A ${meters} m`, type: 'Point', coordinates: [MONTEVIDEO[0], MONTEVIDEO[1] + meters / METERS_PER_DEGREE_LAT]
})

export const PROFILE = Object.freeze({ birthDate: '2001-03-09', university: 'um', interests: ['futbol'] })

/** Body válido de POST /plans (fechas relativas al reloj de los tests). */
export const planBody = (overrides = {}) => ({
  title: 'Partido de fútbol',
  description: 'Actividad recreativa para estudiantes',
  startsAt: hoursFromNow(48).toISOString(),
  endsAt: hoursFromNow(50).toISOString(),
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 0,
  interests: ['futbol'],
  ...overrides
})

/**
 * App de test con el reloj en `NOW` y atajos para llamar como un usuario.
 * @param {Parameters<typeof buildTestModules>[0]} [options]
 */
export function setupApi (options = {}) {
  const modules = buildTestModules({ start: NOW.toISOString(), ...options })
  const call = (method, token) => (path, body) => {
    const req = request(modules.app)[method](`/internal${path}`)
    // `token` puede ser una función: la sesión de un usuario cambia de token cuando los tests mueven el reloj.
    const bearer = typeof token === 'function' ? token() : token
    if (bearer) req.set('Authorization', `Bearer ${bearer}`)
    return body === undefined ? req : req.send(body)
  }
  const as = (token) => ({ get: call('get', token), post: call('post', token), patch: call('patch', token), put: call('put', token), delete: call('delete', token) })

  /** Registra un usuario y, salvo `profile: null`, le completa el perfil (puede crear planes). */
  async function signUp ({ profile = PROFILE, ...overrides } = {}) {
    const { accessToken, user } = await registerViaHttp(request, modules.app, overrides)
    if (profile) {
      const res = await as(accessToken).put('/users/me', profile)
      if (res.status !== 200) throw new Error(`perfil de prueba falló: ${res.status} ${JSON.stringify(res.body)}`)
    }
    const session = { token: accessToken, id: user.id, email: user.email }
    session.api = as(() => session.token)
    return session
  }

  /**
   * Mueve el reloj y vuelve a iniciar la sesión de esos usuarios: el access token dura 15 minutos, así que después
   * de un salto de horas el anterior ya venció.
   * @param {Date} date
   * @param {...{ token: string, email: string }} sessions  Lo que devolvió `signUp`.
   */
  async function travelTo (date, ...sessions) {
    modules.clock.set(date)
    for (const session of sessions) {
      const res = await as(null).post('/auth/login', { email: session.email, password: TEST_PASSWORD })
      if (res.status !== 200) throw new Error(`login de prueba falló: ${res.status} ${JSON.stringify(res.body)}`)
      session.token = res.body.accessToken
    }
  }

  return { ...modules, as, anonymous: as(null), signUp, travelTo }
}

/** Coordenadas del plan de `planBody` y un check-in válido hecho desde ese mismo punto. */
export const PLAN_POINT = Object.freeze({ latitude: -34.9, longitude: -56.16 })
export const checkInBody = (overrides = {}) => ({ ...PLAN_POINT, accuracyMeters: 10, ...overrides })

/** `PLAN_POINT` corrido `meters` al norte. */
export const pointNorthOf = (meters) => ({ latitude: PLAN_POINT.latitude + meters / METERS_PER_DEGREE_LAT, longitude: PLAN_POINT.longitude })

export const expectError = (res, expect, status, code) => {
  expect(res.status).toBe(status)
  expect(res.body).toMatchObject({ code, message: expect.any(String), requestId: expect.any(String) })
}

export const expectValidationError = (res, expect) => {
  expect(res.status).toBe(400)
  expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String), requestId: expect.any(String) })
}
