// Storage en memoria para tests y desarrollo local sin bucket. NO sirve para producción: el estado
// vive en el proceso (hay 2+ instancias) y las URLs no apuntan a ningún servidor real.
// `putObject` simula la subida que en la realidad hace la app directo a S3.

const BASE_URL = 'https://storage.memory.invalid'

/**
 * @param {{ clock: import('../clock.js').Clock }} params
 * @returns {import('./index.js').Storage & { putObject: (key: string, meta: { contentType: string, sizeBytes: number }) => void }}
 */
export function createMemoryStorage ({ clock }) {
  const objects = new Map()

  return {
    putObject (key, { contentType, sizeBytes }) {
      objects.set(key, { contentType, sizeBytes })
    },

    async presignUpload ({ key, expiresInSeconds }) {
      const expiresAt = new Date(clock.now().getTime() + expiresInSeconds * 1000)
      return { url: `${BASE_URL}/${key}?method=PUT&expires=${Math.floor(expiresAt.getTime() / 1000)}`, expiresAt }
    },

    async presignDownload ({ key, expiresInSeconds }) {
      const expires = Math.floor((clock.now().getTime() + expiresInSeconds * 1000) / 1000)
      return `${BASE_URL}/${key}?method=GET&expires=${expires}`
    },

    async headObject (key) {
      const found = objects.get(key)
      return found ? { ...found } : null
    },

    async deleteObject (key) {
      objects.delete(key)
    }
  }
}
