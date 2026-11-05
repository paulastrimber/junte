// PUT y DELETE /plans/:id/spot-alert no llevan cuerpo: la identidad sale del token (`userId` en el body es 400).
import { z } from '../../shared/validation.js'

export const emptyBody = z.strictObject({})
