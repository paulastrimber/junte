// Contraseñas: recuperación con un código que llega por email ("olvidé mi contraseña") y cambio con la sesión iniciada.
// No importa Express ni Mongoose: todo llega por parámetro (DI).
//
// Recuperación:
// - `requestReset` responde igual exista o no la cuenta (no revela qué emails están registrados). Si existe y está
//   activa, guarda el HMAC de un código de 6 dígitos que vence a los 15 minutos y lo manda por email.
// - Límites por cuenta: un código por minuto y 5 por hora; cada código admite 5 intentos. Además Nginx limita por IP.
// - `resetPassword` gasta un intento, compara y, en una transacción, da el código por usado, cambia la contraseña y
//   cierra todas las sesiones. Cualquier falla (cuenta inexistente, código incorrecto, vencido o agotado) es el mismo error.
// Los emails salen después del commit y sin bloquear la respuesta (regla 10): si el envío falla, se loguea.
// Nunca van al log el código, la contraseña ni el email.
import { AppError, errors } from '../../shared/errors.js'
import { passwordChangedMail, resetCodeMail } from './password.mails.js'

export const RESET_CODE_TTL_MS = 15 * 60 * 1000
export const RESET_MAX_ATTEMPTS = 5
export const RESET_RESEND_COOLDOWN_MS = 60 * 1000
export const RESET_WINDOW_MS = 60 * 60 * 1000
export const RESET_MAX_REQUESTS_PER_WINDOW = 5

const invalidCode = () => new AppError('RESET_CODE_INVALID', 'El código no es correcto o ya venció. Pedí uno nuevo.')
const wrongCurrentPassword = () => errors.validation([{ path: 'currentPassword', message: 'La contraseña actual no es correcta' }])

/**
 * @param {object} deps
 * @param {ReturnType<import('../users/user.repository.js').createUserRepository>} deps.userRepo
 * @param {ReturnType<import('./session.repository.js').createSessionRepository>} deps.sessionRepo
 * @param {ReturnType<import('./password-reset.repository.js').createPasswordResetRepository>} deps.passwordResetRepo
 * @param {import('../../adapters/passwordHasher.js').PasswordHasher} deps.passwordHasher
 * @param {ReturnType<import('./reset-code.js').createResetCodes>} deps.resetCodes
 * @param {import('../../adapters/mailer/index.js').Mailer} deps.mailer
 * @param {typeof import('../../adapters/db/index.js').withTransaction} deps.withTransaction
 * @param {{ removeAllByUser: (userId: string) => Promise<unknown> }} [deps.devices]  Tokens de push del usuario.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void, warn: (obj: object, msg: string) => void }} deps.logger
 */
export function createPasswordService ({
  userRepo, sessionRepo, passwordResetRepo, passwordHasher, resetCodes, mailer, withTransaction,
  devices = { removeAllByUser: async () => {} }, clock, logger
}) {
  /** Manda un email sin esperar la respuesta del proveedor. Nunca lanza. */
  function sendInBackground (user, mail, event) {
    Promise.resolve()
      .then(() => mailer.send({ to: user.email, ...mail }))
      .catch((err) => logger.warn({ event, userId: user.id, reason: err?.message }, 'could not send email'))
  }

  const isUsable = (user) => Boolean(user) && user.status === 'active'

  return {
    /**
     * Pide un código para elegir una contraseña nueva. No dice si la cuenta existe: nunca lanza por eso.
     * @param {{ email: string }} params  Ya validado y normalizado.
     * @returns {Promise<void>}
     */
    async requestReset ({ email }) {
      const user = await userRepo.findByEmail(email)
      // Una cuenta suspendida no puede entrar aunque cambie la contraseña: tampoco recibe códigos.
      if (!isUsable(user)) return

      const now = clock.now()
      const code = resetCodes.generate()
      const issued = await passwordResetRepo.issue({
        userId: user.id,
        codeHash: resetCodes.hash(user.id, code),
        now,
        expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MS),
        windowEndsAt: new Date(now.getTime() + RESET_WINDOW_MS),
        cooldownBefore: new Date(now.getTime() - RESET_RESEND_COOLDOWN_MS),
        maxRequests: RESET_MAX_REQUESTS_PER_WINDOW
      })
      if (!issued) {
        // Muy seguido o demasiados pedidos en la hora: no sale otro email y el código anterior sigue valiendo.
        logger.info({ event: 'password.reset_throttled', userId: user.id }, 'password reset request throttled')
        return
      }
      logger.info({ event: 'password.reset_requested', userId: user.id }, 'password reset code issued')
      sendInBackground(user, resetCodeMail({ name: user.name, code, minutes: RESET_CODE_TTL_MS / 60_000 }), 'password.reset_mail_failed')
    },

    /**
     * Cambia la contraseña con el código que llegó por email y cierra todas las sesiones de la cuenta.
     * @param {{ email: string, code: string, newPassword: string }} params  Ya validado.
     * @returns {Promise<void>}
     * @throws {AppError} RESET_CODE_INVALID (también si la cuenta no existe: no se revela)
     */
    async resetPassword ({ email, code, newPassword }) {
      const user = await userRepo.findByEmail(email)
      if (!isUsable(user)) throw invalidCode()

      const now = clock.now()
      // El intento se gasta ANTES de comparar: probar códigos en paralelo no da más intentos.
      const attempt = await passwordResetRepo.consumeAttempt({ userId: user.id, now, maxAttempts: RESET_MAX_ATTEMPTS })
      if (!attempt || !resetCodes.matches(attempt.codeHash, user.id, code)) {
        logger.info({ event: 'password.reset_rejected', userId: user.id }, 'password reset code rejected')
        throw invalidCode()
      }

      const passwordHash = await passwordHasher.hash(newPassword)
      await withTransaction(async (session) => {
        // Si dos pedidos llegan juntos con el código correcto, solo uno lo da por usado.
        if (!await passwordResetRepo.redeem({ userId: user.id, codeHash: attempt.codeHash }, { session })) throw invalidCode()
        await userRepo.setPasswordHash(user.id, passwordHash, { session })
        await sessionRepo.revokeAllByUser(user.id, { now, session })
      })

      // Después del commit. Los teléfonos donde estaba abierta la cuenta dejan de recibir avisos push.
      logger.info({ event: 'password.reset', userId: user.id }, 'password reset')
      Promise.resolve()
        .then(() => devices.removeAllByUser(user.id))
        .catch((err) => logger.warn({ event: 'password.devices_cleanup_failed', userId: user.id, err }, 'could not remove device tokens'))
      sendInBackground(user, passwordChangedMail({ name: user.name }), 'password.changed_mail_failed')
    },

    /**
     * Cambia la contraseña sabiendo la actual. Cierra las demás sesiones; la que hizo el cambio sigue abierta.
     * @param {{ userId: string, sid: string, currentPassword: string, newPassword: string }} params
     *   `userId` y `sid` salen del token.
     * @returns {Promise<void>}
     * @throws {AppError} UNAUTHENTICATED | VALIDATION_ERROR (la contraseña actual no es correcta)
     */
    async changePassword ({ userId, sid, currentPassword, newPassword }) {
      const user = await userRepo.findById(userId)
      // authenticate ya comprobó que existe; si desapareció en el medio, la sesión ya no corresponde a un usuario.
      if (!user) throw errors.unauthenticated()
      if (!await passwordHasher.verify(user.passwordHash, currentPassword)) throw wrongCurrentPassword()

      const passwordHash = await passwordHasher.hash(newPassword)
      const now = clock.now()
      await withTransaction(async (session) => {
        await userRepo.setPasswordHash(userId, passwordHash, { session })
        await sessionRepo.revokeAllByUserExcept(userId, sid, { now, session })
        // Un código de recuperación pendiente deja de servir: la contraseña ya cambió.
        await passwordResetRepo.removeByUser(userId, { session })
      })

      logger.info({ event: 'password.changed', userId }, 'password changed')
      sendInBackground(user, passwordChangedMail({ name: user.name }), 'password.changed_mail_failed')
    }
  }
}
