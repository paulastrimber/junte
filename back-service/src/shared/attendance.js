// Reglas puras de la asistencia (docs/tareas/s4-decisiones.md). ÚNICO lugar donde se definen los parámetros del
// check-in: los usan los planes (ventana y radio), el QR, el check-in y el cierre de asistencia.

const MINUTE_MS = 60 * 1000

export const ATTENDANCE = Object.freeze({
  // La ventana abre antes de `startsAt` y cierra después, pero nunca más tarde que `endsAt`.
  OPENS_BEFORE_START_MS: 15 * MINUTE_MS,
  CLOSES_AFTER_START_MS: 60 * MINUTE_MS,
  // Radio del check-in: lo único que puede elegir el creador.
  RADIUS_MIN_METERS: 50,
  RADIUS_MAX_METERS: 1000,
  RADIUS_DEFAULT_METERS: 150,
  // Precisión del GPS (`accuracyMeters`) por encima de la cual no se acepta la ubicación.
  MAX_ACCURACY_METERS: 100,
  // Tope de lo que se acepta como `accuracyMeters` en el body (validación de formato).
  ACCURACY_LIMIT_METERS: 100_000,
  QR_TTL_MS: 90 * 1000,
  // Al renovar el QR, el anterior sigue valiendo este tiempo (y nunca más allá de su propio vencimiento): quien lo
  // escaneó justo en el cambio no tiene que volver a escanear.
  QR_PREVIOUS_GRACE_MS: 10 * 1000,
  // Check-ins de OTROS participantes que hacen falta para que el creador reciba su +1 al cerrar la asistencia.
  CREATOR_MIN_OTHER_CHECKINS: 2
})

/**
 * Ventana de check-in de un plan: la calcula siempre el back a partir de sus fechas.
 * @param {{ startsAt: Date, endsAt: Date }} plan
 * @returns {{ checkInOpensAt: Date, checkInClosesAt: Date }}
 */
export function computeCheckInWindow ({ startsAt, endsAt }) {
  const closesAt = Math.min(startsAt.getTime() + ATTENDANCE.CLOSES_AFTER_START_MS, endsAt.getTime())
  return {
    checkInOpensAt: new Date(startsAt.getTime() - ATTENDANCE.OPENS_BEFORE_START_MS),
    checkInClosesAt: new Date(closesAt)
  }
}

/**
 * Bordes inclusivos: vale exactamente al abrir y exactamente al cerrar.
 * @param {{ opensAt: Date, closesAt: Date, now: Date }} params
 */
export function isWithinWindow ({ opensAt, closesAt, now }) {
  const time = now.getTime()
  return time >= opensAt.getTime() && time <= closesAt.getTime()
}

/** Borde inclusivo: exactamente en el radio se acepta. */
export const isWithinRadius = (distanceMeters, radiusMeters) => distanceMeters <= radiusMeters

/** Borde inclusivo: exactamente en el máximo se acepta. */
export const isAccurateEnough = (accuracyMeters) => accuracyMeters <= ATTENDANCE.MAX_ACCURACY_METERS
