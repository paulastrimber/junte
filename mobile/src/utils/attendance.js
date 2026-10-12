// Funciones puras de inscripción y asistencia: qué puede hacer el usuario con un plan y qué texto mostrar.
// El back decide siempre (y responde con un `code` si algo cambió); esto solo elige qué botones se ven.

const LIVE_STATUSES = ['open', 'closed']

/** Margen con el que la pantalla del creador pide un QR nuevo antes de que venza el actual. */
export const QR_REFRESH_MARGIN_MS = 15_000
/** Nunca se pide un QR nuevo más seguido que esto, aunque el actual esté por vencer. */
export const QR_MIN_REFRESH_MS = 5_000
/** Largo máximo de un QR de asistencia: algo más largo no es un QR de junte. */
export const QR_TOKEN_MAX_LENGTH = 200

const time = (iso) => new Date(iso).getTime()

/**
 * Qué acciones ofrece el detalle de un plan, según el plan y el estado del usuario en él.
 * @param {object} plan  Detalle de GET /plans/:id (con `myParticipation`).
 * @param {Date} [now]
 */
export function planActions (plan, now = new Date()) {
  const moment = now.getTime()
  const participation = plan.myParticipation ?? null
  const isJoined = participation?.status === 'active'
  const hasCheckedIn = Boolean(participation?.checkedInAt)
  const isLive = LIVE_STATUSES.includes(plan.status)
  const hasStarted = moment >= time(plan.startsAt)
  const hasEnded = moment >= time(plan.endsAt)
  const isCheckInOpen = isLive && moment >= time(plan.checkInOpensAt) && moment <= time(plan.checkInClosesAt)

  return {
    isJoined,
    hasCheckedIn,
    isCheckInOpen,
    wasNoShow: Boolean(participation?.noShow),
    canJoin: !isJoined && plan.status === 'open' && !hasStarted && !plan.isFull,
    canLeave: isJoined && isLive && !hasStarted && !hasCheckedIn,
    // Quien no creó el plan escanea el QR; el creador inscripto registra su asistencia desde la pantalla del QR.
    canCheckIn: isJoined && !plan.isCreator && isCheckInOpen && !hasCheckedIn,
    canShowQr: plan.isCreator && isCheckInOpen,
    canCreatorCheckIn: plan.isCreator && isJoined && isCheckInOpen && !hasCheckedIn,
    canCloseSignUps: plan.isCreator && plan.status === 'open' && !hasStarted,
    canReopenSignUps: plan.isCreator && plan.status === 'closed' && !hasStarted,
    canCancel: plan.isCreator && isLive && !hasEnded,
    canSeeParticipants: plan.isCreator || isJoined
  }
}

/**
 * Cuándo conviene pedir el próximo QR: un poco antes de que venza el actual.
 * @param {string} expiresAt ISO 8601
 * @param {Date} [now]
 * @returns {number} milisegundos de espera.
 */
export function qrRefreshDelay (expiresAt, now = new Date()) {
  return Math.max(QR_MIN_REFRESH_MS, time(expiresAt) - now.getTime() - QR_REFRESH_MARGIN_MS)
}

/** ¿Lo que se leyó con la cámara puede ser un QR de asistencia? (texto corto, no una URL cualquiera). */
export function looksLikeQrToken (data) {
  return typeof data === 'string' && data.length > 0 && data.length <= QR_TOKEN_MAX_LENGTH
}

/** @param {number} reputation @returns {string} "1 asistencia" o "4 asistencias". */
export function formatReputation (reputation) {
  return reputation === 1 ? '1 asistencia' : `${reputation} asistencias`
}

/** @param {number} count @returns {string} "Sin ausencias", "1 ausencia" o "3 ausencias". */
export function formatNoShows (count) {
  if (count === 0) return 'Sin ausencias'
  return count === 1 ? '1 ausencia' : `${count} ausencias`
}
