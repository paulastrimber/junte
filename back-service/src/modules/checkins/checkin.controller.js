// Adapta HTTP: lee la request ya validada y llama al servicio. La identidad sale del token (req.user.id).

/**
 * @param {object} deps
 * @param {ReturnType<import('./checkin.service.js').createCheckInService>} deps.checkInService
 */
export function createCheckInController ({ checkInService }) {
  return {
    async checkIn (req, res) {
      const { qrToken, latitude, longitude, accuracyMeters } = req.body
      const checkIn = await checkInService.checkIn({ planId: req.params.id, userId: req.user.id, qrToken, latitude, longitude, accuracyMeters })
      res.status(201).json({
        planId: checkIn.planId,
        checkedInAt: checkIn.checkedInAt.toISOString(),
        method: checkIn.method,
        // Redondeada: alcanza para mostrarla y no afina la posición de nadie.
        distanceMeters: Math.round(checkIn.distanceMeters)
      })
    }
  }
}
