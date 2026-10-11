// Storage real sobre S3 (S2-BE-09). Bucket privado: el back nunca sirve la imagen, solo firma URLs.
// Credenciales: cadena por defecto del SDK (variables de entorno, perfil, rol IAM de la instancia).
// Nunca se pasan por código ni por configuración de la app.
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const isNotFound = (err) => err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404

/**
 * @param {object} params
 * @param {string} params.bucket  S3_BUCKET
 * @param {string} params.region  AWS_REGION
 * @param {import('../clock.js').Clock} params.clock
 * @param {Pick<S3Client, 'send'>} [params.client]  Solo para tests; por defecto se crea uno con la cadena por defecto.
 * @returns {import('./index.js').Storage}
 */
export function createS3Storage ({ bucket, region, clock, client }) {
  if (!bucket) throw new Error('createS3Storage: falta S3_BUCKET')
  if (!region) throw new Error('createS3Storage: falta AWS_REGION')

  // WHEN_REQUIRED: con el valor por defecto del SDK nuevo, la URL firmada incluye un checksum CRC32
  // calculado sobre un body vacío y S3 rechaza la subida real de la app.
  const s3 = client ?? new S3Client({ region, requestChecksumCalculation: 'WHEN_REQUIRED' })

  return {
    async presignUpload ({ key, contentType, sizeBytes, expiresInSeconds }) {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes })
      // Tipo y tamaño quedan firmados: la app tiene que mandar exactamente esos. Igual se vuelven a
      // verificar con HeadObject antes de vincular la foto (la firma no es la única barrera).
      const url = await getSignedUrl(s3, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length'])
      })
      return { url, expiresAt: new Date(clock.now().getTime() + expiresInSeconds * 1000) }
    },

    presignDownload ({ key, expiresInSeconds }) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds })
    },

    async headObject (key) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { contentType: head.ContentType ?? '', sizeBytes: head.ContentLength ?? 0 }
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },

    async deleteObject (key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    }
  }
}
