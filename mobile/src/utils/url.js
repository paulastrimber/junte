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

/**
 * Lo que identifica a un archivo detrás de una URL firmada de S3: la URL sin la query (donde van la firma y el
 * vencimiento). El back firma de nuevo en cada respuesta, pero la clave cambia solo cuando se sube otra foto (cada
 * subida usa una clave nueva), así que dos URLs con la misma ruta son la misma imagen.
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function withoutSignature (url) {
  if (typeof url !== 'string' || url === '') return null
  return url.split(/[?#]/, 1)[0]
}

/** Dos URLs firmadas apuntan al mismo archivo (o las dos están vacías). */
export function isSameSignedFile (a, b) {
  return withoutSignature(a) === withoutSignature(b)
}
