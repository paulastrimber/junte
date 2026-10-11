import { ApiError, CLIENT_ERROR_CODES } from './api/errors.js'
import { uploadProfilePhoto } from './photoUpload.js'

const TICKET = { url: 'https://bucket.s3.amazonaws.com/users/1/a.jpg?X-Amz-Signature=abc', objectKey: 'users/1/a.jpg', expiresAt: '2026-10-11T15:05:00.000Z' }
const USER = { id: '1', photoUrl: 'https://bucket.s3.amazonaws.com/users/1/a.jpg?read' }

function setup ({ blob = { size: 2048, type: 'image/jpeg' }, putStatus = 200 } = {}) {
  const uploads = { presign: jest.fn(async () => TICKET) }
  const users = { setPhoto: jest.fn(async () => USER) }
  const fetchImpl = jest.fn(async (url, options) => (
    options?.method === 'PUT'
      ? { ok: putStatus >= 200 && putStatus < 300, status: putStatus }
      : { blob: async () => blob }
  ))
  const upload = (asset) => uploadProfilePhoto(asset, { uploads, users, fetchImpl })
  return { uploads, users, fetchImpl, upload }
}

const asset = (overrides = {}) => ({ uri: 'file:///cache/photo.jpg', mimeType: 'image/jpeg', ...overrides })
const putCall = (fetchImpl) => fetchImpl.mock.calls.find(([, options]) => options?.method === 'PUT')

describe('uploadProfilePhoto', () => {
  it('pide la URL firmada, sube a S3 con el tipo y tamaño reales y confirma la clave', async () => {
    const blob = { size: 2048, type: 'image/jpeg' }
    const { upload, uploads, users, fetchImpl } = setup({ blob })

    const user = await upload(asset())

    expect(user).toBe(USER)
    expect(uploads.presign).toHaveBeenCalledWith({ contentType: 'image/jpeg', sizeBytes: 2048 })
    const [url, options] = putCall(fetchImpl)
    expect(url).toBe(TICKET.url)
    expect(options.body).toBe(blob)
    expect(options.headers).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(users.setPhoto).toHaveBeenCalledWith({ objectKey: 'users/1/a.jpg' })
  })

  it('a S3 no se le manda el access token (la firma va en la URL)', async () => {
    const { upload, fetchImpl } = setup()

    await upload(asset())

    expect(JSON.stringify(putCall(fetchImpl)[1].headers).toLowerCase()).not.toContain('authorization')
  })

  it('el orden es presign → PUT a S3 → confirmar', async () => {
    const order = []
    const { upload, uploads, users, fetchImpl } = setup()
    uploads.presign.mockImplementation(async () => { order.push('presign'); return TICKET })
    const original = fetchImpl.getMockImplementation()
    fetchImpl.mockImplementation(async (url, options) => { if (options?.method === 'PUT') order.push('put'); return original(url, options) })
    users.setPhoto.mockImplementation(async () => { order.push('confirm'); return USER })

    await upload(asset())

    expect(order).toEqual(['presign', 'put', 'confirm'])
  })

  it.each(['image/gif', 'image/heic', 'video/mp4', 'application/pdf', undefined])('rechaza el tipo %s antes de pedir la URL', async (mimeType) => {
    const { upload, uploads } = setup({ blob: { size: 100, type: '' } })

    await expect(upload(asset({ mimeType }))).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.IMAGE_NOT_SUPPORTED })
    expect(uploads.presign).not.toHaveBeenCalled()
  })

  it('usa el tipo del blob si el selector no informa mimeType', async () => {
    const { upload, uploads } = setup({ blob: { size: 100, type: 'image/png' } })

    await upload(asset({ mimeType: undefined }))

    expect(uploads.presign).toHaveBeenCalledWith({ contentType: 'image/png', sizeBytes: 100 })
  })

  it('rechaza una imagen de más de 5 MB antes de pedir la URL', async () => {
    const { upload, uploads } = setup({ blob: { size: 5 * 1024 * 1024 + 1, type: 'image/jpeg' } })

    await expect(upload(asset())).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.IMAGE_TOO_LARGE })
    expect(uploads.presign).not.toHaveBeenCalled()
  })

  it('acepta exactamente 5 MB', async () => {
    const { upload } = setup({ blob: { size: 5 * 1024 * 1024, type: 'image/jpeg' } })

    await expect(upload(asset())).resolves.toBe(USER)
  })

  it('rechaza un archivo vacío', async () => {
    const { upload, uploads } = setup({ blob: { size: 0, type: 'image/jpeg' } })

    await expect(upload(asset())).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.IMAGE_NOT_SUPPORTED })
    expect(uploads.presign).not.toHaveBeenCalled()
  })

  it('si S3 rechaza la subida → UPLOAD_FAILED con el status y NO confirma la foto', async () => {
    const { upload, users } = setup({ putStatus: 403 })

    await expect(upload(asset())).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.UPLOAD_FAILED, status: 403 })
    expect(users.setPhoto).not.toHaveBeenCalled()
  })

  it('si no hay conexión durante la subida → NETWORK_ERROR y NO confirma la foto', async () => {
    const { upload, users, fetchImpl } = setup()
    const original = fetchImpl.getMockImplementation()
    fetchImpl.mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') throw new TypeError('Network request failed')
      return original(url, options)
    })

    await expect(upload(asset())).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.NETWORK_ERROR })
    expect(users.setPhoto).not.toHaveBeenCalled()
  })

  it('si el back rechaza la confirmación propaga su ApiError', async () => {
    const { upload, users } = setup()
    users.setPhoto.mockRejectedValue(new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'El archivo no es una imagen' }))

    await expect(upload(asset())).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
  })

  it('si no se puede leer el archivo local → UPLOAD_FAILED', async () => {
    const { upload, fetchImpl, uploads } = setup()
    fetchImpl.mockRejectedValueOnce(new Error('ENOENT'))

    await expect(upload(asset())).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
    expect(uploads.presign).not.toHaveBeenCalled()
  })
})
