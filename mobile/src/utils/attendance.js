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
    // "Avisarme si se libera un lugar" (S5-MOB-06): solo en un plan lleno, abierto y que no empezó (con cupo ilimitado
    // nunca está lleno). `spotAlertRequested` dice si ya lo pidió.
    canAskSpotAlert: !isJoined && plan.status === 'open' && !hasStarted && Boolean(plan.isFull) && !plan.spotAlertRequested,
    canCancelSpotAlert: !isJoined && Boolean(plan.spotAlertRequested),
    canLeave: isJoined && isLive && !hasStarted && !hasCheckedIn,
    // Quien no creó el plan escanea el QR; el creador inscripto registra su asistencia desde la pantalla del QR.
    canCheckIn: isJoined && !plan.isCreator && isCheckInOpen && !hasCheckedIn,
    canShowQr: plan.isCreator && isCheckInOpen,
    canCreatorCheckIn: plan.isCreator && isJoined && isCheckInOpen && !hasCheckedIn,
    canCloseSignUps: plan.isCreator && plan.status === 'open' && !hasStarted,
    canReopenSignUps: plan.isCreator && plan.status === 'closed' && !hasStarted,
    canCancel: plan.isCreator && isLive && !hasEnded,
    canSeeParticipants: plan.isCreator || isJoined,
    // Mismo criterio que el servidor: el creador y quienes están anotados (aunque el plan ya haya terminado).
    canChat: plan.isCreator || isJoined
  }
}

/**
 * Próximo momento en que cambia lo que se puede hacer con el plan: abre o cierra el horario de asistencia, empieza
 * o termina. La pantalla del detalle se refresca sola en ese momento.
 * @param {{ status: string, checkInOpensAt: string, startsAt: string, checkInClosesAt: string, endsAt: string }} plan
 * @param {Date} [now]
 * @returns {Date | null} null si ya no queda ninguno (o el plan está cancelado o completado).
 */
export function nextPlanMilestone (plan, now = new Date()) {
  if (!LIVE_STATUSES.includes(plan.status)) return null
  const upcoming = [plan.checkInOpensAt, plan.startsAt, plan.checkInClosesAt, plan.endsAt]
    .map(time)
    .filter((moment) => Number.isFinite(moment) && moment > now.getTime())
  return upcoming.length > 0 ? new Date(Math.min(...upcoming)) : null
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

/**
 * ¿Ya habría que haber pedido el próximo QR? Pasa al volver de segundo plano: los timers se pausan (Android) o la app
 * se suspende (iOS) y el que estaba programado todavía no corrió.
 * @param {string} expiresAt ISO 8601
 * @param {Date} [now]
 */
export function isQrRefreshDue (expiresAt, now = new Date()) {
  return time(expiresAt) - now.getTime() <= QR_REFRESH_MARGIN_MS
}

/**
 * Vencimiento del QR en el reloj del teléfono. El reloj del teléfono puede estar corrido: la vida del QR se mide con
 * la hora del servidor (`expiresAt` menos el header `Date` de la respuesta) y se cuenta desde que llegó la respuesta.
 * Sin `serverDate` (o si no se puede leer) se usa `expiresAt` tal cual.
 * @param {string} expiresAt ISO 8601, hora del servidor.
 * @param {string | null | undefined} serverDate  Header HTTP `Date` de la respuesta.
 * @param {Date} [receivedAt]  Cuándo llegó la respuesta, en el reloj del teléfono.
 * @returns {string} ISO 8601 en el reloj del teléfono.
 */
export function localQrExpiry (expiresAt, serverDate, receivedAt = new Date()) {
  const lifeMs = time(expiresAt) - (serverDate ? time(serverDate) : NaN)
  if (!Number.isFinite(lifeMs)) return expiresAt
  return new Date(receivedAt.getTime() + lifeMs).toISOString()
}

/**
 * ¿El QR ya venció? Mientras no venza se puede seguir mostrando aunque no se haya podido renovar.
 * @param {string} expiresAt ISO 8601
 * @param {Date} [now]
 */
export function isQrExpired (expiresAt, now = new Date()) {
  return !(time(expiresAt) > now.getTime())
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
