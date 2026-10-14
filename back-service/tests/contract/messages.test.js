// Contrato del chat por REST (S5-BE-01 a 03): GET y POST /plans/:id/messages.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, planBody, setupApi } from '../helpers/plans-api.js'
import { Message } from '../../src/modules/messages/message.model.js'

useTestDb()

const UNKNOWN_ID = '0123456789abcdef01234567'

/** Ana crea un plan, Beto se inscribe y Caro no. */
async function scenario () {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody())
  await beto.api.post(`/plans/${plan.id}/join`)
  return { ...api, ana, beto, caro, plan, path: `/plans/${plan.id}/messages` }
}

describe('POST /plans/:id/messages', () => {
  it('201 con el mensaje; el remitente sale del token y va como vista pública', async () => {
    const { beto, plan, path } = await scenario()

    const res = await beto.api.post(path, { text: '  ¿Alguien lleva pelota?  ', clientId: 'c-1' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      id: expect.any(String),
      planId: plan.id,
      sender: { id: beto.id, name: 'Beto', photoUrl: null, reputation: 0 },
      type: 'text',
      text: '¿Alguien lleva pelota?',
      clientId: 'c-1',
      createdAt: expect.any(String)
    })
  })

  it('el creador puede escribir aunque no esté inscripto', async () => {
    const { ana, path } = await scenario()

    expect((await ana.api.post(path, { text: 'Bienvenidos' })).status).toBe(201)
  })

  it('403 a quien no es participante ni creador, y no guarda nada', async () => {
    const { caro, path } = await scenario()

    expectError(await caro.api.post(path, { text: 'Hola' }), expect, 403, 'FORBIDDEN')
    expect(await Message.countDocuments()).toBe(0)
  })

  it('403 después de darse de baja', async () => {
    const { beto, plan, path } = await scenario()
    await beto.api.delete(`/plans/${plan.id}/join`)

    expectError(await beto.api.post(path, { text: 'Hola' }), expect, 403, 'FORBIDDEN')
  })

  it('400 con texto vacío, de solo espacios o de más de 2000 caracteres', async () => {
    const { beto, path } = await scenario()

    expectValidationError(await beto.api.post(path, { text: '' }), expect)
    expectValidationError(await beto.api.post(path, { text: '    ' }), expect)
    expectValidationError(await beto.api.post(path, { text: 'a'.repeat(2001) }), expect)
    expect((await beto.api.post(path, { text: 'a'.repeat(2000) })).status).toBe(201)
  })

  it('400 si el body trae senderId u otro campo, o un clientId inválido', async () => {
    const { ana, beto, path } = await scenario()

    expectValidationError(await beto.api.post(path, { text: 'Hola', senderId: ana.id }), expect)
    expectValidationError(await beto.api.post(path, { text: 'Hola', status: 'hidden' }), expect)
    expectValidationError(await beto.api.post(path, { text: 'Hola', clientId: 'con espacios' }), expect)
    expectValidationError(await beto.api.post(path, { text: 'Hola', clientId: 'x'.repeat(65) }), expect)
    expect(await Message.countDocuments()).toBe(0)
  })

  it('un reintento con el mismo clientId responde 200 con el mismo mensaje: nunca hay dos', async () => {
    const { beto, path } = await scenario()

    const first = await beto.api.post(path, { text: 'Hola', clientId: 'retry-1' })
    const retry = await beto.api.post(path, { text: 'Hola', clientId: 'retry-1' })

    expect(first.status).toBe(201)
    expect(retry.status).toBe(200)
    expect(retry.body.id).toBe(first.body.id)
    expect(await Message.countDocuments()).toBe(1)
  })

  it('reintentos simultáneos con el mismo clientId crean un solo mensaje', async () => {
    const { beto, path } = await scenario()

    const responses = await Promise.all(Array.from({ length: 5 }, () => beto.api.post(path, { text: 'Hola', clientId: 'race-1' })))

    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1)
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1)
    expect(await Message.countDocuments()).toBe(1)
  })

  it('el mismo clientId de dos personas distintas son dos mensajes', async () => {
    const { ana, beto, path } = await scenario()

    await beto.api.post(path, { text: 'Hola', clientId: 'same' })
    await ana.api.post(path, { text: 'Hola', clientId: 'same' })

    expect(await Message.countDocuments()).toBe(2)
  })

  it('401 sin token; 404 si el plan no existe; 400 si el id no es válido', async () => {
    const { anonymous, beto, path } = await scenario()

    expectError(await anonymous.post(path, { text: 'Hola' }), expect, 401, 'UNAUTHENTICATED')
    expectError(await beto.api.post(`/plans/${UNKNOWN_ID}/messages`, { text: 'Hola' }), expect, 404, 'NOT_FOUND')
    expectValidationError(await beto.api.post('/plans/no-es-un-id/messages', { text: 'Hola' }), expect)
  })
})

describe('GET /plans/:id/messages', () => {
  it('del más nuevo al más viejo, paginado sin duplicados ni saltos y con nextCursor null al final', async () => {
    const { beto, path, clock } = await scenario()
    for (let i = 1; i <= 5; i++) {
      await beto.api.post(path, { text: `m${i}` })
      clock.advance(1000)
    }

    const page1 = await beto.api.get(`${path}?limit=2`)
    const page2 = await beto.api.get(`${path}?limit=2&cursor=${page1.body.nextCursor}`)
    const page3 = await beto.api.get(`${path}?limit=2&cursor=${page2.body.nextCursor}`)

    expect(page1.status).toBe(200)
    expect(page1.headers['cache-control']).toBe('no-store')
    expect([...page1.body.items, ...page2.body.items, ...page3.body.items].map((m) => m.text)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1'])
    expect(page3.body.nextCursor).toBeNull()
  })

  it('mensajes en el mismo milisegundo tampoco se repiten ni se pierden entre páginas', async () => {
    const { beto, path } = await scenario()
    for (let i = 1; i <= 4; i++) await beto.api.post(path, { text: `m${i}` })

    const page1 = await beto.api.get(`${path}?limit=3`)
    const page2 = await beto.api.get(`${path}?limit=3&cursor=${page1.body.nextCursor}`)

    const ids = [...page1.body.items, ...page2.body.items].map((m) => m.id)
    expect(new Set(ids).size).toBe(4)
    expect(page2.body.nextCursor).toBeNull()
  })

  it('no muestra los mensajes ocultos', async () => {
    const { beto, path } = await scenario()
    const { body: hidden } = await beto.api.post(path, { text: 'oculto' })
    await beto.api.post(path, { text: 'visible' })
    await Message.updateOne({ _id: hidden.id }, { $set: { status: 'hidden' } })

    const res = await beto.api.get(path)

    expect(res.body.items.map((m) => m.text)).toEqual(['visible'])
  })

  it('403 a quien no está anotado; 404 si el plan no existe', async () => {
    const { caro, beto, path } = await scenario()

    expectError(await caro.api.get(path), expect, 403, 'FORBIDDEN')
    expectError(await beto.api.get(`/plans/${UNKNOWN_ID}/messages`), expect, 404, 'NOT_FOUND')
  })

  it('400 con limit > 100, un cursor manipulado o un parámetro desconocido', async () => {
    const { beto, path } = await scenario()

    expectValidationError(await beto.api.get(`${path}?limit=101`), expect)
    expectValidationError(await beto.api.get(`${path}?cursor=bm8tZXMtdW4tY3Vyc29y`), expect)
    expectValidationError(await beto.api.get(`${path}?status=hidden`), expect)
  })
})
