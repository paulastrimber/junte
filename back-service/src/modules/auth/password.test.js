// Piezas puras de la recuperación de contraseña: los códigos y los textos de los emails.
import { describe, expect, it } from 'vitest'
import { passwordChangedMail, resetCodeMail } from './password.mails.js'
import { RESET_CODE_LENGTH, createResetCodes } from './reset-code.js'

const SECRET = 'a-test-only-secret-with-at-least-32-chars!!'
const USER_ID = '0123456789abcdef01234567'
const OTHER_ID = '76543210fedcba9876543210'

describe('códigos de recuperación', () => {
  const codes = createResetCodes({ secret: SECRET })

  it(`generate devuelve ${RESET_CODE_LENGTH} dígitos (con ceros a la izquierda) y no siempre el mismo`, () => {
    const generated = Array.from({ length: 200 }, () => codes.generate())

    generated.forEach((code) => expect(code).toMatch(/^\d{6}$/))
    expect(new Set(generated).size).toBeGreaterThan(150)
  })

  it('el hash es un HMAC en hex que depende del código, del usuario y del secreto', () => {
    const hash = codes.hash(USER_ID, '123456')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(codes.hash(USER_ID, '123456'))
    expect(hash).not.toBe(codes.hash(USER_ID, '123457'))
    expect(hash).not.toBe(codes.hash(OTHER_ID, '123456'))
    expect(hash).not.toBe(createResetCodes({ secret: `${SECRET}-otro` }).hash(USER_ID, '123456'))
  })

  it('matches acepta solo el código correcto para ese usuario, y no lanza con un hash guardado inválido', () => {
    const stored = codes.hash(USER_ID, '004200')

    expect(codes.matches(stored, USER_ID, '004200')).toBe(true)
    expect(codes.matches(stored, USER_ID, '004201')).toBe(false)
    expect(codes.matches(stored, OTHER_ID, '004200')).toBe(false)
    expect(codes.matches('no-es-hex', USER_ID, '004200')).toBe(false)
    expect(codes.matches(undefined, USER_ID, '004200')).toBe(false)
  })
})

describe('emails', () => {
  it('el del código lo lleva en texto y en HTML, con el vencimiento y el aviso de no compartirlo', () => {
    const mail = resetCodeMail({ name: 'Ana', code: '042137', minutes: 15 })

    expect(mail.subject).toBe('Tu código para cambiar la contraseña de junte')
    expect(mail.text).toMatch(/Hola Ana:[\s\S]*042137[\s\S]*15 minutos[\s\S]*No compartas/)
    expect(mail.html).toContain('042137')
    expect(mail.html).toContain('15 minutos')
  })

  it('escapa el nombre en el HTML (lo escribe la persona) y funciona sin nombre', () => {
    const mail = resetCodeMail({ name: '<img src=x onerror=alert(1)> & "Ana"', code: '111111', minutes: 15 })

    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Ana&quot;')
    expect(resetCodeMail({ code: '111111', minutes: 15 }).text.startsWith('Hola:')).toBe(true)
  })

  it('el de contraseña cambiada dice qué hacer si no fue la persona, y no lleva ningún código', () => {
    const mail = passwordChangedMail({ name: 'Ana <b>' })

    expect(mail.subject).toBe('Se cambió la contraseña de tu cuenta de junte')
    expect(mail.text).toMatch(/Si no fuiste vos[\s\S]*Olvidaste tu contraseña/)
    expect(mail.text).not.toMatch(/\d{6}/)
    expect(mail.html).toContain('Ana &lt;b&gt;')
  })
})
