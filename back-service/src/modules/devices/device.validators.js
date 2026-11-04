// Esquemas Zod de los dispositivos. La identidad sale del token: `userId` en el body es 400 (strict).
import { z } from '../../shared/validation.js'
import { DEVICE_PLATFORMS } from './device-token.model.js'

// Token nativo de FCM (Android) o APNs (iOS): sin espacios ni caracteres que no van en una URL.
export const DEVICE_TOKEN_MAX_LENGTH = 4096
const tokenField = z.string().min(1).max(DEVICE_TOKEN_MAX_LENGTH).regex(/^[A-Za-z0-9_:.-]+$/, { error: 'El token del dispositivo no es válido' })

export const registerDeviceBody = z.strictObject({
  token: tokenField,
  platform: z.enum(DEVICE_PLATFORMS)
})

export const deviceTokenParams = z.strictObject({ token: tokenField })
