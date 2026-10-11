import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../clock.js'
import { createMemoryStorage } from './memory.js'
import { createS3Storage } from './s3.js'

const clock = () => createFixedClock('2026-10-11T12:00:00Z')

describe('createS3Storage', () => {
  // Credenciales falsas: el presign es un cálculo local, no hace ninguna llamada a AWS.
  const realClient = () => new S3Client({
    region: 'us-east-1',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: 'AKIATESTTESTTESTTEST', secretAccessKey: 'test-secret-not-real' }
  })

  it('presignUpload firma un PUT al bucket, con tipo y tamaño firmados y vencimiento corto', async () => {
    const storage = createS3Storage({ bucket: 'junte-test', region: 'us-east-1', client: realClient(), clock: clock() })

    const { url, expiresAt } = await storage.presignUpload({
      key: 'users/abc/photo.jpg', contentType: 'image/jpeg', sizeBytes: 1234, expiresInSeconds: 300
    })

    const parsed = new URL(url)
    expect(parsed.host).toBe('junte-test.s3.us-east-1.amazonaws.com')
    expect(parsed.pathname).toBe('/users/abc/photo.jpg')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host')
    // Un checksum calculado sobre el body vacío haría que S3 rechace la subida real.
    expect(parsed.searchParams.has('x-amz-checksum-crc32')).toBe(false)
    expect(expiresAt).toEqual(new Date('2026-10-11T12:05:00Z'))
  })

  it('presignDownload firma un GET de corta duración', async () => {
    const storage = createS3Storage({ bucket: 'junte-test', region: 'us-east-1', client: realClient(), clock: clock() })

    const url = await storage.presignDownload({ key: 'users/abc/photo.jpg', expiresInSeconds: 600 })

    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/users/abc/photo.jpg')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(parsed.searchParams.get('x-id')).toBe('GetObject')
  })

  it('headObject devuelve el tipo y el tamaño reales', async () => {
    const send = vi.fn().mockResolvedValue({ ContentType: 'image/png', ContentLength: 2048 })
    const storage = createS3Storage({ bucket: 'b', region: 'r', client: { send }, clock: clock() })

    expect(await storage.headObject('users/abc/a.png')).toEqual({ contentType: 'image/png', sizeBytes: 2048 })
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand)
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'b', Key: 'users/abc/a.png' })
  })

  it('headObject devuelve null si el objeto no existe', async () => {
    const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
    const storage = createS3Storage({ bucket: 'b', region: 'r', client: { send: vi.fn().mockRejectedValue(notFound) }, clock: clock() })

    expect(await storage.headObject('users/abc/missing.png')).toBeNull()
  })

  it('headObject propaga cualquier otro error (permisos, red)', async () => {
    const denied = Object.assign(new Error('AccessDenied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })
    const storage = createS3Storage({ bucket: 'b', region: 'r', client: { send: vi.fn().mockRejectedValue(denied) }, clock: clock() })

    await expect(storage.headObject('users/abc/a.png')).rejects.toThrow('AccessDenied')
  })

  it('deleteObject manda el DeleteObject del bucket', async () => {
    const send = vi.fn().mockResolvedValue({})
    const storage = createS3Storage({ bucket: 'b', region: 'r', client: { send }, clock: clock() })

    await storage.deleteObject('users/abc/a.png')

    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand)
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'b', Key: 'users/abc/a.png' })
  })

  it('sin client inyectado crea uno con la cadena de credenciales por defecto (sin credenciales en el código)', () => {
    const storage = createS3Storage({ bucket: 'b', region: 'us-east-1', clock: clock() })

    expect(storage).toHaveProperty('presignUpload')
  })

  it('exige bucket y región', () => {
    expect(() => createS3Storage({ bucket: '', region: 'us-east-1', clock: clock() })).toThrow(/S3_BUCKET/)
    expect(() => createS3Storage({ bucket: 'b', region: '', clock: clock() })).toThrow(/AWS_REGION/)
  })
})

describe('createMemoryStorage', () => {
  it('guarda lo que "sube" el cliente y lo devuelve en headObject', async () => {
    const storage = createMemoryStorage({ clock: clock() })

    storage.putObject('users/abc/a.jpg', { contentType: 'image/jpeg', sizeBytes: 100 })

    expect(await storage.headObject('users/abc/a.jpg')).toEqual({ contentType: 'image/jpeg', sizeBytes: 100 })
    expect(await storage.headObject('users/abc/otro.jpg')).toBeNull()
  })

  it('deleteObject borra y es idempotente', async () => {
    const storage = createMemoryStorage({ clock: clock() })
    storage.putObject('users/abc/a.jpg', { contentType: 'image/jpeg', sizeBytes: 100 })

    await storage.deleteObject('users/abc/a.jpg')
    await storage.deleteObject('users/abc/a.jpg')

    expect(await storage.headObject('users/abc/a.jpg')).toBeNull()
  })

  it('presignUpload y presignDownload devuelven URLs con vencimiento y la clave', async () => {
    const storage = createMemoryStorage({ clock: clock() })

    const upload = await storage.presignUpload({ key: 'users/abc/a.jpg', contentType: 'image/jpeg', sizeBytes: 100, expiresInSeconds: 300 })
    const download = await storage.presignDownload({ key: 'users/abc/a.jpg', expiresInSeconds: 600 })

    expect(upload.url).toContain('users/abc/a.jpg')
    expect(upload.expiresAt).toEqual(new Date('2026-10-11T12:05:00Z'))
    expect(download).toContain('users/abc/a.jpg')
    expect(download).toContain('expires=')
  })
})
