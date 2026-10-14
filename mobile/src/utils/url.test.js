import { originOf } from './url.js'

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
