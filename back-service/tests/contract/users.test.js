// Contrato HTTP de /users/me (S2-BE-08, S2-BE-10) y de la foto de perfil (S2-BE-09).
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/adapters/logger.js'
import { Session } from '../../src/modules/auth/session.model.js'
import { Interest } from '../../src/modules/catalogs/index.js'
import { User } from '../../src/modules/users/user.model.js'
import { useTestDb } from '../helpers/db.js'
import { TEST_PASSWORD, buildTestModules, registerViaHttp } from '../helpers/modules.js'

useTestDb()

// Fecha fija: 11/10/2026 12:00 en Montevideo.
function setup (options) {
  const modules = buildTestModules(options)
  const as = (token) => ({
    get: (path) => request(modules.app).get(`/internal${path}`).set('Authorization', `Bearer ${token}`),
    put: (path, body) => request(modules.app).put(`/internal${path}`).set('Authorization', `Bearer ${token}`).send(body),
    post: (path, body) => request(modules.app).post(`/internal${path}`).set('Authorization', `Bearer ${token}`).send(body)
  })
  return { ...modules, as, signUp: (overrides) => registerViaHttp(request, modules.app, overrides) }
}

const expectValidationError = (res) => {
  expect(res.status).toBe(400)
  expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.any(String), requestId: expect.any(String) })
}

describe('GET /users/me', () => {
  it('200 con el perfil propio; los campos opcionales vacíos van en null', async () => {
    const { as, signUp } = setup()
    const { accessToken, user } = await signUp({ email: 'ana@um.edu.uy' })

    const res = await as(accessToken).get('/users/me')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      email: 'ana@um.edu.uy',
      name: 'Ana',
      birthDate: null,
      age: null,
      university: null,
      career: null,
      city: null,
      neighborhood: null,
      interests: [],
      reputation: 0,
      photoUrl: null,
      profileComplete: false,
      onboardingCompleted: false,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
  })

  it('401 sin token y 401 (no 404) si el usuario ya no existe', async () => {
    const { as, signUp, app } = setup()
    const { accessToken, user } = await signUp()
    await User.deleteOne({ _id: user.id })

    expect((await request(app).get('/internal/users/me')).status).toBe(401)
    expect((await as(accessToken).get('/users/me')).status).toBe(401)
  })

  it('no filtra hashes ni nada de sesiones, aunque existan en la base', async () => {
    const { as, signUp } = setup()
    const { accessToken, user } = await signUp()
    expect(await Session.countDocuments({ userId: user.id })).toBe(1)

    const res = await as(accessToken).get('/users/me')

    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokenHash|sid|session|jti|role|status/i)
  })
})

describe('PUT /users/me', () => {
  const full = {
    name: 'Ana María',
    birthDate: '2001-03-09',
    university: 'um',
    career: 'ingenieria-en-informatica',
    city: 'montevideo',
    neighborhood: 'pocitos',
    interests: ['futbol', 'cine']
  }

  it('actualiza el perfil, devuelve la edad calculada y completa el perfil', async () => {
    const { as, signUp } = setup()
    const { accessToken } = await signUp()

    const res = await as(accessToken).put('/users/me', full)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ...full, age: 25, profileComplete: true })
    expect((await as(accessToken).get('/users/me')).body).toMatchObject({ ...full, age: 25 })
  })

  it('guarda birthDate como Date a medianoche UTC y la edad no se guarda', async () => {
    const { as, signUp } = setup()
    const { accessToken, user } = await signUp()

    await as(accessToken).put('/users/me', { birthDate: '2001-03-09' })

    const stored = await User.collection.findOne({ _id: new User.base.Types.ObjectId(user.id) })
    expect(stored.birthDate).toEqual(new Date('2001-03-09T00:00:00.000Z'))
    expect(stored).not.toHaveProperty('age')
  })

  it('la edad cambia sola con el reloj: el día del cumpleaños, no antes', async () => {
    const { as, signUp, clock, app } = setup({ start: '2026-03-09T02:00:00Z' }) // 08/03 23:00 en Montevideo
    const { accessToken } = await signUp({ email: 'ana@um.edu.uy' })
    await as(accessToken).put('/users/me', { birthDate: '2001-03-09' })

    expect((await as(accessToken).get('/users/me')).body.age).toBe(24)

    clock.set('2026-03-09T15:00:00Z') // 09/03 12:00 en Montevideo
    const login = await request(app).post('/internal/auth/login').send({ email: 'ana@um.edu.uy', password: TEST_PASSWORD })
    expect((await as(login.body.accessToken).get('/users/me')).body.age).toBe(25)
  })

  it('actualización parcial: lo que no se manda no cambia', async () => {
    const { as, signUp } = setup()
    const { accessToken } = await signUp()
    await as(accessToken).put('/users/me', { university: 'um', interests: ['cine'] })

    const res = await as(accessToken).put('/users/me', { city: 'montevideo' })

    expect(res.body).toMatchObject({ name: 'Ana', university: 'um', interests: ['cine'], city: 'montevideo' })
  })

  it.each([
    ['age', 25], ['email', 'otro@um.edu.uy'], ['role', 'admin'], ['status', 'suspended'], ['reputation', 99],
    ['passwordHash', 'x'], ['refreshTokenHash', 'x'], ['photoKey', 'users/x/y.jpg'], ['userId', '665f1c2a9b1e8a0012345678'], ['id', 'x'],
    ['onboardingCompletedAt', '2026-01-01T00:00:00Z']
  ])('400 si el body trae %s (.strict) y no cambia nada', async (field, value) => {
    const { as, signUp } = setup()
    const { accessToken, user } = await signUp()

    const res = await as(accessToken).put('/users/me', { name: 'Hacker', [field]: value })

    expectValidationError(res)
    expect(res.body.details).toEqual([{ path: field, message: expect.any(String) }])
    expect(await User.findById(user.id)).toMatchObject({ name: 'Ana', role: 'user', status: 'active', reputation: 0 })
  })

  it.each([
    ['fecha inexistente', { birthDate: '2026-02-30' }],
    ['formato distinto', { birthDate: '09/03/2001' }],
    ['con hora', { birthDate: '2001-03-09T00:00:00Z' }],
    ['futura', { birthDate: '2026-10-12' }],
    ['menor de 16', { birthDate: '2010-10-12' }],
    ['mayor de 100', { birthDate: '1925-10-11' }],
    ['universidad en texto libre', { university: 'Universidad de Montevideo' }],
    ['barrio en texto libre', { neighborhood: 'Pocitos' }],
    ['más de 10 intereses', { interests: Array.from({ length: 11 }, (_, i) => `interes-${i}`) }],
    ['intereses repetidos', { interests: ['futbol', 'futbol'] }],
    ['operador de Mongo', { name: { $set: { role: 'admin' } } }],
    ['onboardingCompleted false', { onboardingCompleted: false }],
    ['body vacío', {}]
  ])('400: %s', async (_label, body) => {
    const { as, signUp } = setup()
    const { accessToken } = await signUp()

    expectValidationError(await as(accessToken).put('/users/me', body))
  })

  it('sin token → 401', async () => {
    const { app } = setup()

    const res = await request(app).put('/internal/users/me').send({ name: 'X' })

    expect(res.status).toBe(401)
  })

  it('la identidad sale del token: editar no toca a otros usuarios', async () => {
    const { as, signUp } = setup()
    const ana = await signUp({ email: 'ana@um.edu.uy', name: 'Ana' })
    const beto = await signUp({ email: 'beto@um.edu.uy', name: 'Beto' })

    await as(ana.accessToken).put('/users/me', { name: 'Ana Editada' })

    expect((await as(beto.accessToken).get('/users/me')).body.name).toBe('Beto')
  })

  describe('catálogos (universidad, carrera, ciudad, barrio, intereses)', () => {
    const put = async (body, setupOptions) => {
      const { as, signUp, ...rest } = setup(setupOptions)
      const { accessToken } = await signUp()
      const api = as(accessToken)
      return { api, res: await api.put('/users/me', body), ...rest }
    }

    it('rechaza una universidad que no existe, con el detalle en el campo', async () => {
      const { res } = await put({ university: 'harvard' })

      expectValidationError(res)
      expect(res.body.details).toEqual([{ path: 'university', message: expect.stringMatching(/no existe/) }])
    })

    it('"Otra" vale para universidad, ciudad y barrio, sin texto libre', async () => {
      const { res } = await put({ university: 'other', city: 'other' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ university: 'other', city: 'other', career: null, neighborhood: null })
    })

    it('rechaza una carrera que no es de la universidad elegida', async () => {
      const { res } = await put({ university: 'um', career: 'ingenieria-en-sistemas' }) // es de ORT

      expectValidationError(res)
      expect(res.body.details).toEqual([{ path: 'career', message: expect.stringMatching(/esa universidad/) }])
    })

    it('acepta la carrera de cada universidad y "Otra" carrera', async () => {
      const { api } = await put({ university: 'ort', career: 'ingenieria-en-sistemas' })

      expect((await api.put('/users/me', { career: 'other' })).body.career).toBe('other')
    })

    it('la carrera exige universidad, y con universidad "Otra" no se elige carrera', async () => {
      const { api, res } = await put({ career: 'economia' })
      expect(res.body.details[0]).toMatchObject({ path: 'career' })

      const other = await api.put('/users/me', { university: 'other', career: 'economia' })
      expect(other.body.details[0]).toMatchObject({ path: 'career' })
    })

    it('al cambiar de universidad se quita la carrera anterior', async () => {
      const { api } = await put({ university: 'um', career: 'economia' })

      const res = await api.put('/users/me', { university: 'ort' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ university: 'ort', career: null })
    })

    it('al cambiar de universidad con una carrera nueva en el mismo pedido, se guarda la nueva', async () => {
      const { api } = await put({ university: 'um', career: 'economia' })

      const res = await api.put('/users/me', { university: 'ort', career: 'ingenieria-en-sistemas' })

      expect(res.body).toMatchObject({ university: 'ort', career: 'ingenieria-en-sistemas' })
    })

    it('el barrio exige una ciudad del catálogo y que sea de esa ciudad; al cambiar de ciudad se quita', async () => {
      const { api, res } = await put({ neighborhood: 'pocitos' })
      expect(res.body.details[0]).toMatchObject({ path: 'neighborhood' })

      expect((await api.put('/users/me', { city: 'montevideo', neighborhood: 'pocitos' })).body).toMatchObject({ neighborhood: 'pocitos' })
      expect((await api.put('/users/me', { city: 'montevideo', neighborhood: 'narnia' })).status).toBe(400)
      expect((await api.put('/users/me', { city: 'other' })).body).toMatchObject({ city: 'other', neighborhood: null })
    })

    it('"Bares y cervecerías" tiene edad mínima 18: un menor de 17 no la puede elegir', async () => {
      const { api, res } = await put({ birthDate: '2009-10-11' }) // 17 años el 11/10/2026
      expect(res.status).toBe(200)

      const attempt = await api.put('/users/me', { interests: ['futbol', 'bares-y-cervecerias'] })

      expectValidationError(attempt)
      expect(attempt.body.details).toEqual([{ path: 'interests', message: expect.stringMatching(/18/) }])
    })

    it('sin fecha de nacimiento no se puede elegir una opción con edad mínima', async () => {
      const { res } = await put({ interests: ['salir-a-bailar'] })

      expectValidationError(res)
      expect(res.body.details[0].message).toMatch(/fecha de nacimiento/)
    })

    it('un mayor de 18 sí la elige; y no puede bajar su edad mientras tenga una opción con edad mínima', async () => {
      const { api } = await put({ birthDate: '2000-01-01', interests: ['bares-y-cervecerias'] })

      const younger = await api.put('/users/me', { birthDate: '2010-10-11' }) // 16 años

      expectValidationError(younger)
      expect(younger.body.details[0]).toMatchObject({ path: 'interests' })
    })

    it('una opción desactivada por el admin: quien ya la tenía la conserva; si la suelta, no la puede volver a elegir', async () => {
      const { api, catalogService } = await put({ interests: ['rugby', 'futbol'] })
      await Interest.updateOne({ key: 'rugby' }, { active: false })
      catalogService.invalidate()

      try {
        expect((await api.put('/users/me', { interests: ['rugby', 'cine'] })).status).toBe(200) // la conserva
        expect((await api.put('/users/me', { interests: ['cine'] })).status).toBe(200) // la suelta
        const again = await api.put('/users/me', { interests: ['cine', 'rugby'] })
        expectValidationError(again)
        expect(again.body.details[0].message).toMatch(/Rugby/)
      } finally {
        await Interest.updateOne({ key: 'rugby' }, { active: true })
        catalogService.invalidate()
      }
    })
  })

  describe('onboarding', () => {
    it('onboardingCompleted: true marca el onboarding como hecho y no se puede deshacer', async () => {
      const { as, signUp } = setup()
      const { accessToken, user } = await signUp()
      const api = as(accessToken)

      const res = await api.put('/users/me', { onboardingCompleted: true })

      expect(res.status).toBe(200)
      expect(res.body.onboardingCompleted).toBe(true)
      expect(res.body.profileComplete).toBe(false) // se puede saltar todo: el perfil sigue incompleto
      expect((await User.findById(user.id)).onboardingCompletedAt).toEqual(new Date('2026-10-11T15:00:00Z'))
      expectValidationError(await api.put('/users/me', { onboardingCompleted: false }))
    })

    it('se puede terminar junto con los datos del último paso', async () => {
      const { as, signUp } = setup()
      const { accessToken } = await signUp()

      const res = await as(accessToken).put('/users/me', { interests: ['cine'], onboardingCompleted: true })

      expect(res.body).toMatchObject({ interests: ['cine'], onboardingCompleted: true })
    })
  })
})

describe('privacidad de birthDate, barrio y localidad', () => {
  it('no aparecen en los logs de la request', async () => {
    const lines = []
    const logger = createLogger({ level: 'info', destination: { write: (line) => lines.push(line) } })
    const { as, signUp } = setup({ logger })
    const { accessToken } = await signUp()

    await as(accessToken).put('/users/me', { birthDate: '2001-03-09', city: 'montevideo', neighborhood: 'punta-carretas' })

    const logs = lines.join('')
    expect(logs).toContain('/internal/users/me')
    expect(logs).not.toMatch(/2001-03-09|punta-carretas|montevideo|birthDate/)
  })

  it('el serializer público (otros usuarios) solo expone id, nombre y foto', async () => {
    const { signUp, userSerializer, userRepo } = setup()
    const { user } = await signUp({ email: 'ana@um.edu.uy' })
    await userRepo.updateProfile(user.id, { birthDate: new Date('2001-03-09T00:00:00Z'), neighborhood: 'pocitos', city: 'montevideo', university: 'um', career: 'economia', interests: ['cine'] })

    const view = await userSerializer.serializePublic(await userRepo.findById(user.id))

    expect(view).toEqual({ id: user.id, name: 'Ana', photoUrl: null })
  })
})

describe('foto de perfil: presign → subida → PUT /users/me/photo', () => {
  async function presign (as, overrides = {}) {
    return as.post('/uploads/presign', { contentType: 'image/jpeg', sizeBytes: 2048, ...overrides })
  }

  it('flujo completo: el perfil queda con una photoUrl firmada de lectura', async () => {
    const { as, signUp, storage } = setup()
    const { accessToken, user } = await signUp()
    const api = as(accessToken)
    const { body: ticket } = await presign(api)
    storage.putObject(ticket.objectKey, { contentType: 'image/jpeg', sizeBytes: 2048 }) // la app sube directo a S3

    const res = await api.put('/users/me/photo', { objectKey: ticket.objectKey })

    expect(res.status).toBe(200)
    expect(res.body.photoUrl).toContain(ticket.objectKey)
    expect(res.body.photoUrl).toContain('expires=')
    expect(JSON.stringify(res.body)).not.toContain('photoKey')
    expect((await User.findById(user.id)).photoKey).toBe(ticket.objectKey)
    expect((await api.get('/users/me')).body.photoUrl).toContain(ticket.objectKey)
  })

  it('403 si la clave es de otro usuario', async () => {
    const { as, signUp, storage } = setup()
    const ana = await signUp({ email: 'ana@um.edu.uy' })
    const beto = await signUp({ email: 'beto@um.edu.uy' })
    const { body: ticket } = await presign(as(beto.accessToken))
    storage.putObject(ticket.objectKey, { contentType: 'image/jpeg', sizeBytes: 2048 })

    const res = await as(ana.accessToken).put('/users/me/photo', { objectKey: ticket.objectKey })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
    expect(await storage.headObject(ticket.objectKey)).not.toBeNull() // la foto de Beto no se toca
  })

  it('404 si el objeto nunca se subió', async () => {
    const { as, signUp } = setup()
    const { accessToken } = await signUp()
    const { body: ticket } = await presign(as(accessToken))

    const res = await as(accessToken).put('/users/me/photo', { objectKey: ticket.objectKey })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('400 si lo subido no es una imagen del tipo declarado, y el objeto se borra', async () => {
    const { as, signUp, storage } = setup()
    const { accessToken } = await signUp()
    const { body: ticket } = await presign(as(accessToken))
    storage.putObject(ticket.objectKey, { contentType: 'text/html', sizeBytes: 2048 })

    const res = await as(accessToken).put('/users/me/photo', { objectKey: ticket.objectKey })

    expectValidationError(res)
    expect(await storage.headObject(ticket.objectKey)).toBeNull()
  })

  it('400 si el tamaño real supera el máximo, aunque se haya pedido uno chico', async () => {
    const { as, signUp, storage } = setup()
    const { accessToken } = await signUp()
    const { body: ticket } = await presign(as(accessToken), { sizeBytes: 10 })
    storage.putObject(ticket.objectKey, { contentType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024 })

    expectValidationError(await as(accessToken).put('/users/me/photo', { objectKey: ticket.objectKey }))
  })

  it.each([
    {},
    { objectKey: '' },
    { objectKey: 'users/../../etc/passwd' },
    { objectKey: 'plans/665f1c2a9b1e8a0012345678/a.jpg' },
    { objectKey: { $ne: null } },
    { objectKey: 'users/665f1c2a9b1e8a0012345678/a.jpg', photoKey: 'x' }
  ])('400 con el body %j', async (body) => {
    const { as, signUp } = setup()
    const { accessToken } = await signUp()

    expectValidationError(await as(accessToken).put('/users/me/photo', body))
  })
})
