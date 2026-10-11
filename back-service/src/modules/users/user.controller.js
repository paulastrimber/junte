// Adapta HTTP: lee la request ya validada, llama al servicio y pasa por el serializer.
// La identidad sale del token (req.user.id), nunca del body.

/**
 * @param {object} deps
 * @param {ReturnType<import('./user.service.js').createUserService>} deps.userService
 * @param {ReturnType<import('./user.serializer.js').createUserSerializer>} deps.userSerializer
 */
export function createUserController ({ userService, userSerializer }) {
  return {
    async getMe (req, res) {
      const user = await userService.getProfile(req.user.id)
      res.json(await userSerializer.serializeOwner(user))
    },

    async updateMe (req, res) {
      const user = await userService.updateProfile({ userId: req.user.id, changes: req.body })
      res.json(await userSerializer.serializeOwner(user))
    },

    async setPhoto (req, res) {
      const user = await userService.setPhoto({ userId: req.user.id, objectKey: req.body.objectKey })
      res.json(await userSerializer.serializeOwner(user))
    }
  }
}
