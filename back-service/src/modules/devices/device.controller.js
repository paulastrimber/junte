// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {{ deviceService: ReturnType<import('./device.service.js').createDeviceService> }} deps
 */
export function createDeviceController ({ deviceService }) {
  return {
    async register (req, res) {
      const { token, platform } = req.body
      const { created } = await deviceService.register({ userId: req.user.id, token, platform })
      res.status(created ? 201 : 200).json({ token, platform })
    },

    async unregister (req, res) {
      await deviceService.unregister({ userId: req.user.id, token: req.params.token })
      res.status(204).end()
    }
  }
}
