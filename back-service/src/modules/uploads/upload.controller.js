/**
 * @param {{ uploadService: ReturnType<import('./upload.service.js').createUploadService> }} deps
 */
export function createUploadController ({ uploadService }) {
  return {
    async presign (req, res) {
      const { url, objectKey, expiresAt } = await uploadService.presign({ userId: req.user.id, ...req.body })
      res.json({ url, objectKey, expiresAt: expiresAt.toISOString() })
    }
  }
}
