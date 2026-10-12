// Esquema Zod del check-in. Estricto: `userId`, `distanceMeters` o cualquier otro campo es 400.
// La ubicación llega como `latitude`/`longitude` sueltas (única excepción al orden [lng, lat], así lo define el
// informe); el back las usa para calcular la distancia y NO las guarda ni las loguea.
import { ATTENDANCE } from '../../shared/attendance.js'
import { z } from '../../shared/validation.js'

export const checkInBody = z.strictObject({
  // Obligatorio salvo para el creador inscripto (lo decide el servicio). El formato fino lo valida el servicio:
  // un QR mal formado es QR_INVALID, no un error de validación.
  qrToken: z.string().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(ATTENDANCE.ACCURACY_LIMIT_METERS)
})
