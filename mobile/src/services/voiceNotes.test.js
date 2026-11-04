import { CLIENT_ERROR_CODES } from './api/errors.js'
import { MAX_AUDIO_BYTES, uploadVoiceNote } from './voiceNotes.js'

const blobOf = (size) => ({ size, type: '' })

function setup ({ size = 50_000, putStatus = 200 } = {}) {
  const uploads = { presign: jest.fn(async () => ({ url: 'https://s3/put', objectKey: 'messages/p/u/a.m4a', expiresAt: 'x' })) }
  const fetchImpl = jest.fn(async (url) => (url.startsWith('file:') ? { blob: async () => blobOf(size) } : { ok: putStatus < 400, status: putStatus }))
  return { uploads, fetchImpl }
}

describe('uploadVoiceNote', () => {
  it('pide la URL con el plan, sube el audio como audio/mp4 y devuelve la clave y la duración', async () => {
    const { uploads, fetchImpl } = setup()

    const result = await uploadVoiceNote({ planId: 'p1', uri: 'file:///nota.m4a', durationMs: 4200.4 }, { uploads, fetchImpl })

    expect(uploads.presign).toHaveBeenCalledWith({ contentType: 'audio/mp4', sizeBytes: 50_000, planId: 'p1' })
    expect(fetchImpl).toHaveBeenLastCalledWith('https://s3/put', expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'audio/mp4' } }))
    expect(result).toEqual({ audioKey: 'messages/p/u/a.m4a', durationMs: 4200 })
  })

  it('más de 2 MB o más de 60 s: AUDIO_TOO_LARGE sin pedir la URL', async () => {
    for (const [size, durationMs] of [[MAX_AUDIO_BYTES + 1, 1000], [1000, 60_001]]) {
      const { uploads, fetchImpl } = setup({ size })
      await expect(uploadVoiceNote({ planId: 'p1', uri: 'file:///n.m4a', durationMs }, { uploads, fetchImpl })).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.AUDIO_TOO_LARGE })
      expect(uploads.presign).not.toHaveBeenCalled()
    }
  })

  it('S3 rechaza la subida: UPLOAD_FAILED', async () => {
    const { uploads, fetchImpl } = setup({ putStatus: 403 })
    await expect(uploadVoiceNote({ planId: 'p1', uri: 'file:///n.m4a', durationMs: 1000 }, { uploads, fetchImpl })).rejects.toMatchObject({ code: CLIENT_ERROR_CODES.UPLOAD_FAILED })
  })
})
