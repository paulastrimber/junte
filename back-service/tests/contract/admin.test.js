// Contrato del panel de administración (S6-BE-02 y 03): todo /admin/* exige rol admin, cola de reportes con vista previa,
// resolución, moderación de mensajes, suspensión de cuentas y métricas. Los catálogos: admin-catalogs.test.js.
import { describe, expect, it } from 'vitest'
import { CheckIn } from '../../src/modules/checkins/checkin.model.js'
import { Message } from '../../src/modules/messages/message.model.js'
import { Report } from '../../src/modules/reports/report.model.js'
import { Session } from '../../src/modules/auth/session.model.js'
import { User } from '../../src/modules/users/user.model.js'
import { useTestDb } from '../helpers/db.js'
import { makePlan, makeUser } from '../helpers/factories.js'
import { TEST_PASSWORD } from '../helpers/modules.js'
import { NOW, expectError, expectValidationError, hoursFromNow, planBody, setupApi } from '../helpers/plans-api.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'
const MINUTE_MS = 60 * 1000

/** Admin + Ana (crea un plan y escribe), Beto (inscripto) y Caro. */
async function scenario () {
  const api = setupApi()
  const admin = await api.signUp({ name: 'Admin' })
  await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } })
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody({ title: 'Fútbol 5' }))
  await beto.api.post(`/plans/${plan.id}/join`)
  const { body: message } = await ana.api.post(`/plans/${plan.id}/messages`, { text: 'Mensaje ofensivo' })
  return { ...api, admin, ana, beto, caro, plan, message }
}

const ADMIN_REQUESTS = [
  ['get', '/admin/reports'],
  ['patch', `/admin/reports/${UNKNOWN_ID}`, { status: 'reviewed' }],
  ['patch', `/admin/messages/${UNKNOWN_ID}`, { status: 'hidden' }],
  ['patch', `/admin/users/${UNKNOWN_ID}`, { status: 'suspended' }],
  ['get', '/admin/metrics'],
  ['get', '/admin/catalogs/interests'],
  ['post', '/admin/catalogs/interests', { key: 'test-x', name: 'X', categoryKey: 'deportes' }],
  ['patch', `/admin/catalogs/interests/${UNKNOWN_ID}`, { name: 'X' }],
  ['get', '/admin/no-existe']
]

describe('permisos', () => {
  it('cada endpoint /admin/* con un usuario común → 403 FORBIDDEN', async () => {
    const { beto } = await scenario()

    for (const [method, path, body] of ADMIN_REQUESTS) {
      expectError(await beto.api[method](path, body), expect, 403, 'FORBIDDEN')
    }
  })

  it('sin token → 401', async () => {
    const { anonymous } = await scenario()

    for (const [method, path, body] of ADMIN_REQUESTS) {
      expectError(await anonymous[method](path, body), expect, 401, 'UNAUTHENTICATED')
    }
  })

  it('el rol se lee en cada request: al quitárselo, el mismo token recibe 403', async () => {
    const { admin } = await scenario()
    expect((await admin.api.get('/admin/metrics')).status).toBe(200)

    await User.updateOne({ _id: admin.id }, { $set: { role: 'user' } })

    expectError(await admin.api.get('/admin/metrics'), expect, 403, 'FORBIDDEN')
  })

  it('el servicio también comprueba el rol (segunda barrera)', async () => {
    const { adminService, beto, admin } = await scenario()

    await expect(adminService.getMetrics({ adminId: beto.id })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(adminService.getMetrics({ adminId: admin.id })).resolves.toMatchObject({ windowDays: 7 })
  })
})

describe('GET /admin/reports', () => {
  it('cola de pendientes del más viejo al más nuevo, con quién reportó y la vista previa de lo reportado', async () => {
    const { admin, ana, beto, caro, plan, message, clock } = await scenario()
    await beto.api.post('/reports', { targetType: 'message', targetId: message.id, reason: 'harassment' })
    clock.advance(MINUTE_MS)
    await caro.api.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'other', description: 'Perfil falso' })
    clock.advance(MINUTE_MS)
    await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })

    const res = await admin.api.get('/admin/reports')

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.nextCursor).toBeNull()
    expect(res.body.items.map((item) => item.target.type)).toEqual(['message', 'user', 'plan'])
    const anaView = { id: ana.id, name: 'Ana', email: ana.email, role: 'user', status: 'active', reputation: 0, createdAt: expect.any(String) }
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      status: 'pending',
      reason: 'harassment',
      description: null,
      createdAt: NOW.toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      reporter: { id: beto.id, name: 'Beto', email: beto.email, role: 'user', status: 'active', reputation: 0, createdAt: expect.any(String) },
      target: {
        type: 'message',
        id: message.id,
        pendingReports: 1,
        preview: {
          id: message.id,
          planId: plan.id,
          type: 'text',
          text: 'Mensaje ofensivo',
          status: 'visible',
          createdAt: expect.any(String),
          sender: anaView,
          plan: { id: plan.id, title: 'Fútbol 5' }
        }
      }
    })
    expect(res.body.items[1]).toMatchObject({ reason: 'other', description: 'Perfil falso', target: { type: 'user', preview: anaView } })
    expect(res.body.items[2].target.preview).toMatchObject({ id: plan.id, title: 'Fútbol 5', status: 'open', creator: anaView, locationLabel: 'Cancha del campus' })
  })

  it('cuenta los pendientes de varias personas sobre lo mismo', async () => {
    const { admin, beto, caro, plan } = await scenario()
    await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })
    await caro.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'spam' })

    const { body } = await admin.api.get('/admin/reports')

    expect(body.items.map((item) => item.target.pendingReports)).toEqual([2, 2])
  })

  it('pagina sin duplicados ni saltos; un cursor de otro estado es 400', async () => {
    const { admin, plan, clock } = await scenario()
    const reporters = await Promise.all(Array.from({ length: 5 }, () => makeUser()))
    for (const reporter of reporters) {
      await Report.create({ reporterId: reporter._id, targetType: 'plan', targetId: plan.id, reason: 'spam', status: 'pending', createdAt: clock.now() })
    }

    const first = await admin.api.get('/admin/reports?limit=2')
    const second = await admin.api.get(`/admin/reports?limit=2&cursor=${first.body.nextCursor}`)
    const third = await admin.api.get(`/admin/reports?limit=2&cursor=${second.body.nextCursor}`)

    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map((item) => item.id)
    expect(new Set(ids).size).toBe(5)
    expect(third.body.nextCursor).toBeNull()
    expectValidationError(await admin.api.get(`/admin/reports?status=reviewed&cursor=${first.body.nextCursor}`), expect)
    expectValidationError(await admin.api.get('/admin/reports?status=todos'), expect)
    expectValidationError(await admin.api.get('/admin/reports?limit=101'), expect)
  })

  it('lo reportado que ya no existe sale con preview null', async () => {
    const { admin, beto, caro } = await scenario()
    await beto.api.post('/reports', { targetType: 'user', targetId: caro.id, reason: 'spam' })
    await User.deleteOne({ _id: caro.id })

    const { body } = await admin.api.get('/admin/reports')

    expect(body.items[0].target).toEqual({ type: 'user', id: caro.id, pendingReports: 1, preview: null })
  })
})

describe('PATCH /admin/reports/:id', () => {
  it('resolver un pendiente resuelve también los demás pendientes sobre lo mismo', async () => {
    const { admin, beto, caro, plan, ana } = await scenario()
    const { body: first } = await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })
    await caro.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'spam' })
    const { body: other } = await caro.api.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'spam' })

    const res = await admin.api.patch(`/admin/reports/${first.id}`, { status: 'reviewed' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: first.id, status: 'reviewed', resolvedAt: NOW.toISOString(), resolvedBy: { id: admin.id, name: 'Admin' }, resolvedCount: 2 })
    expect(await Report.countDocuments({ status: 'reviewed' })).toBe(2)
    expect((await Report.findById(other.id).lean()).status).toBe('pending')
    const { body: queue } = await admin.api.get('/admin/reports')
    expect(queue.items.map((item) => item.id)).toEqual([other.id])
    const { body: history } = await admin.api.get('/admin/reports?status=reviewed')
    expect(history.items).toHaveLength(2)
  })

  it('uno resuelto se puede corregir, pero nunca vuelve a pendiente', async () => {
    const { admin, beto, plan } = await scenario()
    const { body: report } = await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })
    await admin.api.patch(`/admin/reports/${report.id}`, { status: 'reviewed' })

    const corrected = await admin.api.patch(`/admin/reports/${report.id}`, { status: 'dismissed' })
    const same = await admin.api.patch(`/admin/reports/${report.id}`, { status: 'dismissed' })

    expect(corrected.body).toMatchObject({ status: 'dismissed', resolvedCount: 1 })
    expect(same.body).toMatchObject({ status: 'dismissed', resolvedCount: 0 })
    expectValidationError(await admin.api.patch(`/admin/reports/${report.id}`, { status: 'pending' }), expect)
  })

  it('404 si no existe; 400 con un id o un body inválido', async () => {
    const { admin } = await scenario()

    expectError(await admin.api.patch(`/admin/reports/${UNKNOWN_ID}`, { status: 'reviewed' }), expect, 404, 'NOT_FOUND')
    expectValidationError(await admin.api.patch('/admin/reports/abc', { status: 'reviewed' }), expect)
    expectValidationError(await admin.api.patch(`/admin/reports/${UNKNOWN_ID}`, { status: 'reviewed', reason: 'spam' }), expect)
  })
})

describe('PATCH /admin/messages/:id', () => {
  it('ocultar lo saca del historial de los usuarios; volver a mostrarlo lo devuelve', async () => {
    const { admin, beto, plan, message } = await scenario()
    const path = `/plans/${plan.id}/messages`

    const hidden = await admin.api.patch(`/admin/messages/${message.id}`, { status: 'hidden' })

    expect(hidden.status).toBe(200)
    expect(hidden.body).toMatchObject({ id: message.id, planId: plan.id, status: 'hidden', text: 'Mensaje ofensivo', sender: { name: 'Ana' } })
    expect((await beto.api.get(path)).body.items).toEqual([])

    await admin.api.patch(`/admin/messages/${message.id}`, { status: 'visible' })
    expect((await beto.api.get(path)).body.items.map((item) => item.id)).toEqual([message.id])
  })

  it('404 si no existe', async () => {
    const { admin } = await scenario()

    expectError(await admin.api.patch(`/admin/messages/${UNKNOWN_ID}`, { status: 'hidden' }), expect, 404, 'NOT_FOUND')
  })
})

describe('PATCH /admin/users/:id', () => {
  it('suspender corta el acceso en el acto: requests, refresh y login', async () => {
    const { admin, beto, anonymous } = await scenario()
    const { body: login } = await anonymous.post('/auth/login', { email: beto.email, password: TEST_PASSWORD })

    const res = await admin.api.patch(`/admin/users/${beto.id}`, { status: 'suspended' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: beto.id, status: 'suspended', role: 'user', email: beto.email })
    expectError(await beto.api.get('/users/me'), expect, 401, 'ACCOUNT_SUSPENDED')
    expect(await Session.countDocuments({ userId: beto.id, revokedAt: null })).toBe(0)
    expectError(await anonymous.post('/auth/refresh', { refreshToken: login.refreshToken }), expect, 401, 'ACCOUNT_SUSPENDED')
    expectError(await anonymous.post('/auth/login', { email: beto.email, password: TEST_PASSWORD }), expect, 401, 'ACCOUNT_SUSPENDED')
  })

  it('reactivar le devuelve el acceso; sus planes e inscripciones siguen como estaban', async () => {
    const { admin, beto, anonymous, plan } = await scenario()
    await admin.api.patch(`/admin/users/${beto.id}`, { status: 'suspended' })

    const res = await admin.api.patch(`/admin/users/${beto.id}`, { status: 'active' })

    expect(res.body.status).toBe('active')
    expect((await anonymous.post('/auth/login', { email: beto.email, password: TEST_PASSWORD })).status).toBe(200)
    const { body: detail } = await admin.api.get(`/plans/${plan.id}`)
    expect(detail.participantCount).toBe(1)
  })

  it('403 al suspenderse a sí mismo o a otra cuenta admin; 404 si no existe', async () => {
    const { admin, signUp } = await scenario()
    const other = await signUp({ name: 'Otra admin' })
    await User.updateOne({ _id: other.id }, { $set: { role: 'admin' } })

    expectError(await admin.api.patch(`/admin/users/${admin.id}`, { status: 'suspended' }), expect, 403, 'FORBIDDEN')
    expectError(await admin.api.patch(`/admin/users/${other.id}`, { status: 'suspended' }), expect, 403, 'FORBIDDEN')
    expectError(await admin.api.patch(`/admin/users/${UNKNOWN_ID}`, { status: 'suspended' }), expect, 404, 'NOT_FOUND')
    expectValidationError(await admin.api.patch(`/admin/users/${other.id}`, { status: 'suspended', role: 'user' }), expect)
  })
})

describe('GET /admin/metrics', () => {
  it('totales y últimos 7 días', async () => {
    const { admin, beto, plan, message, clock } = await scenario()
    // Los usuarios y planes del escenario se crearon con el reloj real (antes de NOW): no cuentan en la ventana.
    // Usuarios: los 4 del escenario, 2 más y quien crea el plan de la factory.
    await makeUser({ createdAt: hoursFromNow(-24) })
    await makeUser({ createdAt: hoursFromNow(-24 * 10), status: 'suspended' })
    await makePlan({ createdAt: hoursFromNow(-2), creatorId: (await makeUser({ createdAt: hoursFromNow(-24 * 30) }))._id })
    await CheckIn.create({ planId: plan.id, userId: beto.id, checkedInAt: hoursFromNow(-1), method: 'qr-location', distanceMeters: 10, accuracyMeters: 5 })
    await Message.updateOne({ _id: message.id }, { $set: { status: 'hidden' } })
    await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })

    const res = await admin.api.get('/admin/metrics')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      generatedAt: clock.now().toISOString(),
      since: hoursFromNow(-24 * 7).toISOString(),
      windowDays: 7,
      users: { total: 7, createdSince: 1, suspended: 1 },
      plans: { total: 2, createdSince: 1 },
      participations: { active: 1, joinedSince: 1 },
      checkIns: { total: 1, createdSince: 1 },
      messages: { total: 1, createdSince: 1, hidden: 1 },
      reports: { pending: 1, createdSince: 1 }
    })
  })
})
