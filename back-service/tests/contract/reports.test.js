// Contrato de POST /reports (S6-BE-01): motivos fijos, el objetivo tiene que existir y ser accesible para quien
// reporta (si no, 404), nada propio, y un reporte pendiente repetido no crea otro.
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/adapters/logger.js'
import { Message } from '../../src/modules/messages/message.model.js'
import { Report } from '../../src/modules/reports/report.model.js'
import { useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, planBody, setupApi } from '../helpers/plans-api.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'

/** Ana crea un plan y escribe en el chat; Beto se inscribe; Caro no tiene nada que ver con el plan. */
async function scenario (options) {
  const api = setupApi(options)
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody())
  await beto.api.post(`/plans/${plan.id}/join`)
  const { body: message } = await ana.api.post(`/plans/${plan.id}/messages`, { text: 'Hola a todos' })
  return { ...api, ana, beto, caro, plan, message }
}

describe('POST /reports', () => {
  it('201 con { id, status: pending } y lo guarda con el reporterId del token', async () => {
    const { beto, ana } = await scenario()

    const res = await beto.api.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'harassment', description: '  Me escribió mal  ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(String), status: 'pending' })
    const saved = await Report.findById(res.body.id).lean()
    expect(String(saved.reporterId)).toBe(beto.id)
    expect(saved).toMatchObject({ targetType: 'user', reason: 'harassment', description: 'Me escribió mal', status: 'pending' })
  })

  it('reporta un plan visible y un mensaje de un chat del que es parte', async () => {
    const { beto, plan, message } = await scenario()

    expect((await beto.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' })).status).toBe(201)
    expect((await beto.api.post('/reports', { targetType: 'message', targetId: message.id, reason: 'spam' })).status).toBe(201)
  })

  it('el mismo reporte pendiente otra vez responde 200 con el mismo id: nunca hay dos', async () => {
    const { beto, plan } = await scenario()
    const body = { targetType: 'plan', targetId: plan.id, reason: 'spam' }

    const first = await beto.api.post('/reports', body)
    const again = await beto.api.post('/reports', { ...body, reason: 'scam' })
    const [a, b] = await Promise.all([beto.api.post('/reports', body), beto.api.post('/reports', body)])

    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.body).toEqual({ id: first.body.id, status: 'pending' })
    expect([a.body.id, b.body.id]).toEqual([first.body.id, first.body.id])
    expect(await Report.countDocuments()).toBe(1)
  })

  it('dos personas que reportan lo mismo son dos reportes', async () => {
    const { beto, caro, plan } = await scenario()
    const body = { targetType: 'plan', targetId: plan.id, reason: 'spam' }

    expect((await beto.api.post('/reports', body)).status).toBe(201)
    expect((await caro.api.post('/reports', body)).status).toBe(201)
    expect(await Report.countDocuments()).toBe(2)
  })

  it('después de que se resuelve, se puede volver a reportar lo mismo', async () => {
    const { beto, plan } = await scenario()
    const body = { targetType: 'plan', targetId: plan.id, reason: 'spam' }
    const first = await beto.api.post('/reports', body)
    await Report.updateOne({ _id: first.body.id }, { $set: { status: 'dismissed' } })

    const second = await beto.api.post('/reports', body)

    expect(second.status).toBe(201)
    expect(second.body.id).not.toBe(first.body.id)
  })

  describe('404 si el objetivo no existe o quien reporta no podría verlo', () => {
    it('usuario, plan o mensaje inexistente', async () => {
      const { beto } = await scenario()

      for (const targetType of ['user', 'plan', 'message']) {
        expectError(await beto.api.post('/reports', { targetType, targetId: UNKNOWN_ID, reason: 'spam' }), expect, 404, 'NOT_FOUND')
      }
      expect(await Report.countDocuments()).toBe(0)
    })

    it('un mensaje de un chat del que no es parte (no 403: no se revela que existe)', async () => {
      const { caro, message } = await scenario()

      expectError(await caro.api.post('/reports', { targetType: 'message', targetId: message.id, reason: 'spam' }), expect, 404, 'NOT_FOUND')
    })

    it('un mensaje oculto por un admin', async () => {
      const { beto, message } = await scenario()
      await Message.updateOne({ _id: message.id }, { $set: { status: 'hidden' } })

      expectError(await beto.api.post('/reports', { targetType: 'message', targetId: message.id, reason: 'spam' }), expect, 404, 'NOT_FOUND')
    })

    it('un plan cancelado que no es suyo ni tiene inscripción', async () => {
      const { ana, caro, plan } = await scenario()
      await ana.api.patch(`/plans/${plan.id}`, { status: 'cancelled' })

      expectError(await caro.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'scam' }), expect, 404, 'NOT_FOUND')
    })
  })

  it('400 al reportarse a sí mismo, su propio plan o su propio mensaje', async () => {
    const { ana, plan, message } = await scenario()

    expectValidationError(await ana.api.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'spam' }), expect)
    expectValidationError(await ana.api.post('/reports', { targetType: 'plan', targetId: plan.id, reason: 'spam' }), expect)
    expectValidationError(await ana.api.post('/reports', { targetType: 'message', targetId: message.id, reason: 'spam' }), expect)
    expect(await Report.countDocuments()).toBe(0)
  })

  it('400 con motivo, tipo o id inválidos, campos de más o "other" sin descripción', async () => {
    const { beto, ana } = await scenario()
    const valid = { targetType: 'user', targetId: ana.id, reason: 'spam' }

    expectValidationError(await beto.api.post('/reports', { ...valid, reason: 'no-me-gusta' }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, targetType: 'comment' }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, targetId: 'abc' }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, reporterId: ana.id }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, status: 'reviewed' }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, description: 'x'.repeat(501) }), expect)
    expectValidationError(await beto.api.post('/reports', { ...valid, targetId: { $ne: null } }), expect)
    const other = await beto.api.post('/reports', { ...valid, reason: 'other', description: '   ' })
    expectValidationError(other, expect)
    expect(other.body.details).toEqual([expect.objectContaining({ path: 'description' })])
    expect(await Report.countDocuments()).toBe(0)

    expect((await beto.api.post('/reports', { ...valid, reason: 'other', description: 'Usa fotos de otra persona' })).status).toBe(201)
  })

  it('401 sin token', async () => {
    const { anonymous, ana } = await scenario()

    expectError(await anonymous.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'spam' }), expect, 401, 'UNAUTHENTICATED')
  })

  it('no hay forma de listar reportes desde la API de usuarios', async () => {
    const { beto } = await scenario()

    expectError(await beto.api.get('/reports'), expect, 404, 'NOT_FOUND')
  })

  it('el log del reporte no lleva la descripción', async () => {
    const lines = []
    const logger = createLogger({ level: 'info', destination: { write: (line) => lines.push(line) } })
    const { beto, ana } = await scenario({ logger })

    await beto.api.post('/reports', { targetType: 'user', targetId: ana.id, reason: 'other', description: 'texto-privado-del-reporte' })

    const output = lines.join('')
    expect(output).toContain('"event":"report.created"')
    expect(output).not.toContain('texto-privado-del-reporte')
  })
})
