import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../logger.js'
import { createConsoleMailer, createMailerFromConfig, createMemoryMailer, createNoopMailer, createResendMailer } from './index.js'

const API_KEY = 're_test_clave_secreta_123'
const FROM = 'junte <no-reply@junteapp.me>'
const MAIL = Object.freeze({ to: 'ana@um.edu.uy', subject: 'Tu código', text: 'Tu código es 123456', html: '<p>Tu código es 123456</p>' })

function capture (level = 'info') {
  const lines = []
  const logger = createLogger({ level, destination: { write: (line) => lines.push(line) } })
  return { logger, output: () => lines.join('') }
}

describe('Resend', () => {
  it('hace un POST a la API con la clave en Authorization y el email en JSON', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'e1' }), { status: 200 }))
    const mailer = createResendMailer({ apiKey: API_KEY, from: FROM, fetch })

    await mailer.send(MAIL)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ from: FROM, to: ['ana@um.edu.uy'], subject: 'Tu código', text: MAIL.text, html: MAIL.html })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('sin html no manda el campo', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }))

    await createResendMailer({ apiKey: API_KEY, from: FROM, fetch }).send({ to: MAIL.to, subject: MAIL.subject, text: MAIL.text })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('html')
  })

  it('si Resend rechaza el email, falla con el status y sin la clave, el destinatario ni el contenido', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: `The ${MAIL.to} address is not allowed` }), { status: 403 }))

    const err = await createResendMailer({ apiKey: API_KEY, from: FROM, fetch }).send(MAIL).catch((error) => error)

    expect(err.message).toBe('Resend responded with HTTP 403')
    expect(String(err.stack)).not.toMatch(/re_test|ana@um|123456/)
  })

  it('si la red falla, el error no arrastra la request original', async () => {
    const fetch = vi.fn(async () => { throw Object.assign(new TypeError(`fetch failed for ${API_KEY}`), { name: 'TypeError' }) })

    const err = await createResendMailer({ apiKey: API_KEY, from: FROM, fetch }).send(MAIL).catch((error) => error)

    expect(err.message).toBe('Resend request failed (TypeError)')
    expect(err.cause).toBeUndefined()
  })
})

describe('memoria (tests)', () => {
  it('guarda lo que habría mandado; failNext hace fallar solo el próximo envío', async () => {
    const mailer = createMemoryMailer()

    await mailer.send(MAIL)
    mailer.failNext()
    await expect(mailer.send(MAIL)).rejects.toThrow()
    await mailer.send({ ...MAIL, subject: 'Otro' })

    expect(mailer.sent.map((mail) => mail.subject)).toEqual(['Tu código', 'Otro'])
  })
})

describe('sin credenciales', () => {
  it('en desarrollo muestra el email en el log (así se prueba el flujo sin Resend)', async () => {
    const { logger, output } = capture()

    await createConsoleMailer({ logger }).send(MAIL)

    expect(output()).toContain('"event":"mail.dev"')
    expect(output()).toContain('123456')
    expect(output()).toContain('ana@um.edu.uy')
  })

  it('en producción avisa que no se envió, sin el destinatario ni el contenido', async () => {
    const { logger, output } = capture()

    await createNoopMailer({ logger }).send(MAIL)

    expect(output()).toContain('"event":"mail.disabled"')
    expect(output()).not.toMatch(/123456|ana@um|Tu código/)
  })
})

describe('createMailerFromConfig', () => {
  const { logger, output } = capture()
  const mail = { resend: { apiKey: API_KEY }, from: FROM }

  it('con credenciales usa Resend, en cualquier entorno', () => {
    for (const env of ['development', 'test', 'production']) {
      expect(createMailerFromConfig({ config: { env, mail }, logger })).not.toHaveProperty('sent')
    }
  })

  it('sin credenciales: en memoria en tests, el log en desarrollo y no-op en producción', async () => {
    expect(createMailerFromConfig({ config: { env: 'test', mail: null }, logger })).toHaveProperty('sent')

    await createMailerFromConfig({ config: { env: 'production', mail: null }, logger }).send(MAIL)
    expect(output()).not.toContain('123456')

    await createMailerFromConfig({ config: { env: 'development', mail: null }, logger }).send(MAIL)
    expect(output()).toContain('123456')
  })
})
