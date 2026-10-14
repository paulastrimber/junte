// Funciones puras sobre URLs. No se usa `new URL(...).origin`: el polyfill de URL de React Native no lo implementa.

const ORIGIN = /^(https?:\/\/[^/?#\s]+)/i

/**
 * Origen (esquema + host + puerto) de una URL: `http://10.0.2.2:8080/api/v1` → `http://10.0.2.2:8080`.
 * Sirve para conectar el socket: Socket.io recibe el origen y el `path` aparte.
 * @param {string} url
 * @returns {string}
 * @throws {Error} si no es una URL http(s).
 */
export function originOf (url) {
  const match = ORIGIN.exec(typeof url === 'string' ? url.trim() : '')
  if (!match) throw new Error(`No es una URL http(s): "${url}"`)
  return match[1]
}
