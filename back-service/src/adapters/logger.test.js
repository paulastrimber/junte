import { describe, expect, it } from 'vitest'
import { createLogger } from './logger.js'

function capture () {
  const lines = []
  const logger = createLogger({ level: 'info', destination: { write: (line) => lines.push(JSON.parse(line)) } })
  return { logger, lines }
}

describe('redact', () => {
  it.each([
    ['birthDate', '2001-03-09'],
    ['neighborhood', 'Punta Carretas'],
    ['city', 'Montevideo'],
    ['password', 'hunter2hunter2'],
    ['passwordHash', '$argon2id$v=19$secret'],
    ['refreshTokenHash', 'abc123hash'],
    ['refreshToken', 'eyJ.refresh.token'],
    ['accessToken', 'eyJ.access.token'],
    ['photoUrl', 'https://bucket.s3.amazonaws.com/users/x/y.jpg?X-Amz-Signature=deadbeef'],
    ['latitude', -34.9011],
    ['longitude', -56.1645],
    ['email', 'ana@um.edu.uy'],
    ['text', 'mensaje privado del chat'],
    ['description', 'descripción privada de un reporte']
  ])('censura %s en el nivel raíz y anidado un nivel', (field, value) => {
    const { logger, lines } = capture()

    logger.info({ [field]: value, user: { [field]: value } }, 'evento')

    expect(lines[0][field]).toBe('[REDACTED]')
    expect(lines[0].user[field]).toBe('[REDACTED]')
    expect(JSON.stringify(lines[0])).not.toContain(String(value))
  })

  it('censura el header Authorization', () => {
    const { logger, lines } = capture()

    logger.info({ req: { headers: { authorization: 'Bearer secreto' } } }, 'evento')

    expect(JSON.stringify(lines[0])).not.toContain('secreto')
  })
})
