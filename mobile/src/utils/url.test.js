import { isSameSignedFile, originOf, withoutSignature } from './url.js'

describe('originOf', () => {
  it.each([
    ['http://10.0.2.2:8080/api/v1', 'http://10.0.2.2:8080'],
    ['https://api.junte.app/api/v1', 'https://api.junte.app'],
    ['https://api.junte.app', 'https://api.junte.app'],
    ['http://localhost:8080/api/v1/?x=1#y', 'http://localhost:8080'],
    ['  HTTPS://Api.Junte.app/api/v1  ', 'HTTPS://Api.Junte.app']
  ])('%s → %s', (url, origin) => {
    expect(originOf(url)).toBe(origin)
  })

  it.each(['', 'api.junte.app/api/v1', 'ftp://x.test/a', '/api/v1', null, undefined])('rechaza %j', (url) => {
    expect(() => originOf(url)).toThrow(/URL http\(s\)/)
  })
})

describe('withoutSignature e isSameSignedFile', () => {
  it('saca la query (firma y vencimiento) de una URL firmada', () => {
    expect(withoutSignature('https://b.s3.amazonaws.com/users/u1/a.jpg?X-Amz-Signature=x#y')).toBe('https://b.s3.amazonaws.com/users/u1/a.jpg')
    expect(withoutSignature(null)).toBeNull()
    expect(withoutSignature('')).toBeNull()
  })

  it('compara por archivo, no por firma', () => {
    expect(isSameSignedFile('https://b.test/a.jpg?s=1', 'https://b.test/a.jpg?s=2')).toBe(true)
    expect(isSameSignedFile('https://b.test/a.jpg?s=1', 'https://b.test/b.jpg?s=1')).toBe(false)
    expect(isSameSignedFile(null, undefined)).toBe(true)
    expect(isSameSignedFile(null, 'https://b.test/a.jpg')).toBe(false)
  })
})
