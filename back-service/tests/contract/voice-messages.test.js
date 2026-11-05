// Notas de voz (S5-BE-09): presign del audio (solo quien es parte del chat) y envío por REST con `type: 'voice'`.
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../helpers/db.js'
import { expectError, expectValidationError, planBody, setupApi } from '../helpers/plans-api.js'
import { Message } from '../../src/modules/messages/message.model.js'

useTestDb()

const AUDIO = { contentType: 'audio/mp4', sizeBytes: 300_000 }

/** Ana crea un plan, Beto se inscribe y Caro no. */
async function scenario () {
  const api = setupApi()
  const ana = await api.signUp({ name: 'Ana' })
  const beto = await api.signUp({ name: 'Beto' })
  const caro = await api.signUp({ name: 'Caro' })
  const { body: plan } = await ana.api.post('/plans', planBody())
  await beto.api.post(`/plans/${plan.id}/join`)
  /** Pide la URL y "sube" el audio (el storage en memoria simula el PUT a S3). */
  async function upload (person, meta = { contentType: 'audio/mp4', sizeBytes: 300_000 }) {
    const res = await person.api.post('/uploads/presign', { ...AUDIO, planId: plan.id })
    expect(res.status).toBe(200)
    api.storage.putObject(res.body.objectKey, meta)
    return res.body.objectKey
  }
  return { ...api, ana, beto, caro, plan, upload, path: `/plans/${plan.id}/messages` }
}

describe('POST /uploads/presign con audio', () => {
  it('clave bajo messages/<planId>/<userId>/ para quien es parte del chat', async () => {
    const { beto, ana, plan } = await scenario()

    for (const person of [beto, ana]) {
      const res = await person.api.post('/uploads/presign', { ...AUDIO, planId: plan.id })
      expect(res.status).toBe(200)
      expect(res.body.objectKey).toMatch(new RegExp(`^messages/${plan.id}/${person.id}/[A-Za-z0-9-]+\\.m4a$`))
    }
  })

  it('403 a quien no es parte del chat; 400 sin planId o con más de 2 MB', async () => {
    const { caro, beto, plan } = await scenario()

    expectError(await caro.api.post('/uploads/presign', { ...AUDIO, planId: plan.id }), expect, 403, 'FORBIDDEN')
    expectValidationError(await beto.api.post('/uploads/presign', AUDIO), expect)
    expectValidationError(await beto.api.post('/uploads/presign', { ...AUDIO, sizeBytes: 2 * 1024 * 1024 + 1, planId: plan.id }), expect)
  })
})

describe('POST /plans/:id/messages con una nota de voz', () => {
  it('201 con audioUrl firmada y durationMs; text null; nunca sale audioKey', async () => {
    const { beto, path, upload } = await scenario()
    const audioKey = await upload(beto)

    const res = await beto.api.post(path, { type: 'voice', audioKey, durationMs: 4200, clientId: 'v-1' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ type: 'voice', text: null, durationMs: 4200, clientId: 'v-1', audioUrl: expect.stringContaining(audioKey) })
    expect(res.body).not.toHaveProperty('audioKey')
    const { body: history } = await beto.api.get(path)
    expect(history.items[0]).toMatchObject({ type: 'voice', durationMs: 4200, audioUrl: expect.any(String) })
  })

  it('el audio de otra persona es 403; uno que no se subió, 404', async () => {
    const { ana, beto, path, upload, plan } = await scenario()
    const anasAudio = await upload(ana)

    expectError(await beto.api.post(path, { type: 'voice', audioKey: anasAudio, durationMs: 1000 }), expect, 403, 'FORBIDDEN')
    const missing = `messages/${plan.id}/${beto.id}/no-existe.m4a`
    expectError(await beto.api.post(path, { type: 'voice', audioKey: missing, durationMs: 1000 }), expect, 404, 'NOT_FOUND')
    expect(await Message.countDocuments()).toBe(0)
  })

  it('un archivo que no es audio AAC se rechaza (400) y se borra', async () => {
    const { beto, path, upload, storage } = await scenario()
    const audioKey = await upload(beto, { contentType: 'image/png', sizeBytes: 1000 })

    expectValidationError(await beto.api.post(path, { type: 'voice', audioKey, durationMs: 1000 }), expect)
    expect(await storage.headObject(audioKey)).toBeNull()
  })

  it('400: voz con texto, voz sin audio o sin duración, más de 60 s, texto con audio', async () => {
    const { beto, path, upload } = await scenario()
    const audioKey = await upload(beto)

    for (const body of [
      { type: 'voice', audioKey, durationMs: 1000, text: 'hola' },
      { type: 'voice', durationMs: 1000 },
      { type: 'voice', audioKey },
      { type: 'voice', audioKey, durationMs: 60_001 },
      { text: 'hola', audioKey }
    ]) {
      expectValidationError(await beto.api.post(path, body), expect)
    }
    expect(await Message.countDocuments()).toBe(0)
  })

  it('el texto sigue funcionando con y sin type', async () => {
    const { beto, path } = await scenario()

    expect((await beto.api.post(path, { text: 'hola' })).body).toMatchObject({ type: 'text', text: 'hola' })
    expect((await beto.api.post(path, { type: 'text', text: 'chau' })).body).toMatchObject({ type: 'text', text: 'chau' })
  })
})
