// Esquemas Zod de /auth. Estrictos: un campo desconocido es 400. La contraseña no se recorta ni se normaliza.
import { nameField } from '../../shared/profile-fields.js'
import { z } from '../../shared/validation.js'
import { RESET_CODE_LENGTH } from './reset-code.js'

export const PASSWORD_MIN = 8
// Tope para que un body enorme no obligue a Argon2 a procesar megas.
export const PASSWORD_MAX = 128

/** Email normalizado (trim + minúsculas) antes de buscar y de guardar. */
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254))
/** Etiqueta opcional del dispositivo ("android", "Pixel 7") para listar las sesiones. */
const deviceLabelField = z.string().trim().min(1).max(60).optional()

export const registerBody = z.strictObject({
  name: nameField,
  email: emailField,
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  deviceLabel: deviceLabelField
})

export const loginBody = z.strictObject({
  email: emailField,
  // Sin mínimo de 8: no se le explica la política a quien está probando contraseñas.
  password: z.string().min(1).max(PASSWORD_MAX),
  deviceLabel: deviceLabelField
})

export const refreshBody = z.strictObject({
  refreshToken: z.string().min(1).max(2048)
})

/** Contraseña nueva: la misma política que al registrarse. */
const newPasswordField = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)

export const forgotPasswordBody = z.strictObject({
  email: emailField
})

export const resetPasswordBody = z.strictObject({
  email: emailField,
  // El código que llegó por email. Se aceptan espacios alrededor (copiar y pegar), nada más.
  code: z.string().trim().regex(new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`), { error: `El código tiene ${RESET_CODE_LENGTH} dígitos` }),
  newPassword: newPasswordField
})

export const changePasswordBody = z.strictObject({
  // Sin mínimo de 8, igual que el login: es la contraseña que la persona ya tiene.
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: newPasswordField
}).refine((body) => body.newPassword !== body.currentPassword, {
  path: ['newPassword'],
  error: 'La contraseña nueva tiene que ser distinta de la actual'
})
