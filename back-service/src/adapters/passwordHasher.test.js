import { describe, expect, it } from 'vitest'
import { createArgon2Hasher } from './passwordHasher.js'
import { createFastHasher } from '../../tests/helpers/fast-hasher.js'

describe('createArgon2Hasher', () => {
  const hasher = createArgon2Hasher()

  it('genera un hash Argon2id con sal propia que verifica la contraseña correcta', async () => {
    const first = await hasher.hash('correct horse battery')
    const second = await hasher.hash('correct horse battery')

    expect(first).toMatch(/^\$argon2id\$/)
    expect(first).not.toBe(second)
    expect(await hasher.verify(first, 'correct horse battery')).toBe(true)
  })

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hasher.hash('correct horse battery')

    expect(await hasher.verify(hash, 'Correct horse battery')).toBe(false)
  })

  it.each(['!seed-no-login', '', 'not-a-hash', '$argon2id$v=19$garbage', '$2b$12$abcdefghijklmnopqrstuv'])(
    'un hash con formato inválido (%j) da false, no lanza',
    async (invalid) => {
      expect(await hasher.verify(invalid, 'whatever')).toBe(false)
    }
  )

  it('un hash que no es texto da false', async () => {
    expect(await hasher.verify(undefined, 'whatever')).toBe(false)
    expect(await hasher.verify(null, 'whatever')).toBe(false)
  })
})

describe('createFastHasher (el de los tests)', () => {
  it('cumple el mismo contrato que el real', async () => {
    const hasher = createFastHasher()

    const hash = await hasher.hash('secret-password')

    expect(await hasher.verify(hash, 'secret-password')).toBe(true)
    expect(await hasher.verify(hash, 'other-password')).toBe(false)
    expect(await hasher.verify('!seed-no-login', 'secret-password')).toBe(false)
    expect(hash).not.toContain('secret-password')
  })
})
