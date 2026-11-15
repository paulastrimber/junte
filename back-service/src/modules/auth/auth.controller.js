// Adapta HTTP: sin negocio. El usuario sale por el serializer (nunca el documento crudo).

/**
 * @param {object} deps
 * @param {ReturnType<import('./auth.service.js').createAuthService>} deps.authService
 * @param {ReturnType<import('./password.service.js').createPasswordService>} deps.passwordService
 * @param {(user: object) => Promise<object>} deps.serializeUser  Vista del dueño (users).
 */
export function createAuthController ({ authService, passwordService, serializeUser }) {
  const sessionResponse = async ({ user, accessToken, refreshToken }) => ({
    user: await serializeUser(user), accessToken, refreshToken
  })

  return {
    async register (req, res) {
      res.status(201).json(await sessionResponse(await authService.register(req.body)))
    },

    async login (req, res) {
      res.json(await sessionResponse(await authService.login(req.body)))
    },

    async refresh (req, res) {
      const { accessToken, refreshToken } = await authService.refresh({ refreshToken: req.body.refreshToken })
      res.json({ accessToken, refreshToken })
    },

    /** Cierra la sesión del access token con el que se llamó. */
    async logout (req, res) {
      await authService.logout({ sid: req.auth.sid })
      res.status(204).end()
    },

    async logoutAll (req, res) {
      await authService.logoutAll({ userId: req.user.id })
      res.status(204).end()
    },

    /** Siempre 202, exista o no la cuenta: la respuesta no revela qué emails están registrados. */
    async forgotPassword (req, res) {
      await passwordService.requestReset({ email: req.body.email })
      res.status(202).end()
    },

    async resetPassword (req, res) {
      await passwordService.resetPassword(req.body)
      res.status(204).end()
    },

    /** La identidad y la sesión que queda abierta salen del token. */
    async changePassword (req, res) {
      const { currentPassword, newPassword } = req.body
      await passwordService.changePassword({ userId: req.user.id, sid: req.auth.sid, currentPassword, newPassword })
      res.status(204).end()
    }
  }
}
