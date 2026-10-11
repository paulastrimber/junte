// Adapter `storage` (S3 o memoria). Los servicios reciben una implementación por parámetro (DI).
export { createMemoryStorage } from './memory.js'
export { createS3Storage } from './s3.js'

/**
 * @typedef {object} Storage
 * @property {(params: { key: string, contentType: string, sizeBytes: number, expiresInSeconds: number }) => Promise<{ url: string, expiresAt: Date }>} presignUpload
 *   URL `PUT` firmada. El tipo y el tamaño declarados quedan firmados.
 * @property {(params: { key: string, expiresInSeconds: number }) => Promise<string>} presignDownload  URL `GET` firmada.
 * @property {(key: string) => Promise<{ contentType: string, sizeBytes: number } | null>} headObject
 *   Tipo y tamaño REALES del objeto subido; null si no existe.
 * @property {(key: string) => Promise<void>} deleteObject  Idempotente.
 */
