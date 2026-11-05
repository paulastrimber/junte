// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {{ spotAlertService: ReturnType<import('./spot-alert.service.js').createSpotAlertService> }} deps
 */
export function createSpotAlertController ({ spotAlertService }) {
  return {
    async request (req, res) {
      await spotAlertService.request({ planId: req.params.id, userId: req.user.id })
      res.status(204).end()
    },

    async cancel (req, res) {
      await spotAlertService.cancel({ planId: req.params.id, userId: req.user.id })
      res.status(204).end()
    }
  }
}
